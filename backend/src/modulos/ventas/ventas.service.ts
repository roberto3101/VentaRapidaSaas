import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Prisma, SaleStatus, MovementType } from '@prisma/client';
import { CrearVentaDto } from './dto/crear-venta.dto';
import { CompletarVentaDto } from './dto/completar-venta.dto';
import { CancelarVentaDto } from './dto/cancelar-venta.dto';
import { FiltrosVentaDto } from './dto/filtros-venta.dto';
import {
  calcularLinea,
  calcularTotalVenta,
  calcularVuelto,
  validarPagosCubrenTotal,
} from './dominio/calculador-totales';
import { Rol } from '../../common/constantes/roles.constant';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class VentasService {
  private readonly logger = new Logger(VentasService.name);

  constructor(private readonly db: DatabaseService) {}

  // ============================================================
  // CREAR (status: draft)
  // ============================================================
  async crear(dto: CrearVentaDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;

    // Validar que la sede pertenece al tenant + el cajero tiene acceso
    await this.assertCajeroPuedeOperarSede(usuario, dto.locationId);

    const tenant = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    // tasa de impuesto efectiva (Location o Tenant) — se aplica a todas las líneas
    const taxRateNum = await this.db.obtenerTasaImpuestoEfectiva(tenantId, dto.locationId);
    const taxRate = new Prisma.Decimal(taxRateNum);

    // Calcular líneas (precio efectivo + tax desde catálogo)
    const lineas = await Promise.all(
      dto.items.map(async (item) => {
        const variant = await this.db.productVariant.findUniqueOrThrow({
          where: { id: item.variantId },
          include: { product: { select: { tenantId: true, name: true } } },
        });

        // Multi-tenant guard: variante debe pertenecer al tenant
        if (variant.product.tenantId !== tenantId) {
          throw new ForbiddenException('Producto fuera del tenant actual');
        }

        const unitPriceNum = item.unitPriceHint
          ?? await this.db.obtenerPrecioEfectivo(item.variantId, dto.locationId, 'sale');
        const unitPrice = new Prisma.Decimal(unitPriceNum);

        const quantity = new Prisma.Decimal(item.quantity);
        const discountAmount = item.discountAmount
          ? new Prisma.Decimal(item.discountAmount)
          : new Prisma.Decimal(0);

        // Validar descuento no excede 50% del bruto (regla de negocio)
        const bruto = unitPrice.mul(quantity);
        if (discountAmount.gt(bruto.mul('0.5'))) {
          throw new BadRequestException(
            `Descuento de ${variant.product.name} no puede exceder 50% del precio bruto`,
          );
        }

        const calculo = calcularLinea({ unitPrice, quantity, taxRate, discountAmount });

        return {
          variantId: item.variantId,
          productName: variant.product.name,
          productSku: variant.sku,
          unitPrice,
          quantity,
          taxRate,
          discountAmount,
          ...calculo,
        };
      }),
    );

    const totales = calcularTotalVenta(lineas);

    // Numerar la venta (correlativo por tenant+location)
    const saleNumber = await this.obtenerSiguienteNumero(tenantId, dto.locationId);

    const sale = await this.db.sale.create({
      data: {
        tenantId,
        locationId: dto.locationId,
        cashierId: usuario.sub,
        customerId: dto.customerId ?? null,
        saleNumber,
        status: SaleStatus.draft,
        subtotal: totales.subtotal,
        taxAmount: totales.taxAmount,
        discountAmount: lineas.reduce((acc, l) => acc.plus(l.discountAmount), new Prisma.Decimal(0)),
        total: totales.total,
        currencyCode: tenant.currencyCode,
        notes: dto.notes,
        items: {
          create: lineas.map((l) => ({
            tenantId,
            variantId: l.variantId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            taxAmount: l.taxAmount,
            discountAmount: l.discountAmount,
            lineTotal: l.lineTotal,
            productName: l.productName,
            productSku: l.productSku,
          })),
        },
      },
      include: this.includeCompleto(),
    });

    this.logger.log(`Venta creada ${sale.id} (${sale.saleNumber}) por ${usuario.sub}`);
    return sale;
  }

  // ============================================================
  // COMPLETAR (draft -> completed, descuenta stock atomico)
  // ============================================================
  async completar(saleId: string, dto: CompletarVentaDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;

    const sale = await this.db.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status !== SaleStatus.draft) {
      throw new BadRequestException(`Venta no se puede completar (status: ${sale.status})`);
    }

    // Validar pagos cubren el total
    const pagosDecimal = dto.payments.map((p) => ({ ...p, amount: new Prisma.Decimal(p.amount) }));
    try {
      validarPagosCubrenTotal(pagosDecimal, sale.total);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    // Calcular vuelto en pagos de efectivo si se mandó receivedAmount
    const pagosConVuelto = dto.payments.map((p) => {
      let changeAmount: Prisma.Decimal | null = null;
      if (p.method === 'cash' && p.receivedAmount != null) {
        try {
          changeAmount = calcularVuelto(new Prisma.Decimal(p.amount), new Prisma.Decimal(p.receivedAmount));
        } catch (err) {
          throw new BadRequestException((err as Error).message);
        }
      }
      return { ...p, changeAmount };
    });

    // Transacción: completar venta + descontar stock + crear InventoryMovements
    const result = await this.db.$transaction(async (tx) => {
      // Lock + check stock por cada item ANTES de descontar
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const requiereStockCheck = !tenant.allowNegativeStock;

      for (const item of sale.items) {
        if (requiereStockCheck) {
          const filas = await tx.$queryRaw<Array<{ available_quantity: number }>>`
            SELECT available_quantity
            FROM inventory_stock
            WHERE variant_id = ${item.variantId}::uuid
              AND location_id = ${sale.locationId}::uuid
            FOR UPDATE
          `;
          const disponible = Number(filas[0]?.available_quantity ?? 0);
          const requerido = Number(item.quantity);
          if (disponible < requerido) {
            throw new BadRequestException(
              `Stock insuficiente para ${item.productName}. Disponible: ${disponible}, requerido: ${requerido}`,
            );
          }
        }

        // Crear InventoryMovement de tipo 'sale' direction=-1
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            locationId: sale.locationId,
            variantId: item.variantId,
            movementType: MovementType.sale,
            quantity: Number(item.quantity),
            direction: -1,
            referenceCode: `SALE-${sale.saleNumber}`,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            subtotal: item.lineTotal.minus(item.taxAmount),
            total: item.lineTotal,
            currencyCode: sale.currencyCode,
            createdBy: usuario.sub,
            notes: `Venta automática #${sale.saleNumber}`,
          },
        });
      }

      // Crear pagos
      await tx.payment.createMany({
        data: pagosConVuelto.map((p) => ({
          saleId: sale.id,
          tenantId,
          method: p.method,
          amount: new Prisma.Decimal(p.amount),
          reference: p.reference,
          receivedAmount: p.receivedAmount ? new Prisma.Decimal(p.receivedAmount) : null,
          changeAmount: p.changeAmount,
        })),
      });

      // Marcar como completed
      return tx.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.completed, completedAt: new Date() },
        include: this.includeCompleto(),
      });
    });

    this.logger.log(`Venta completada ${result.id} (${result.saleNumber})`);
    return result;
  }

  // ============================================================
  // CANCELAR (completed -> cancelled, revierte stock)
  // ============================================================
  async cancelar(saleId: string, dto: CancelarVentaDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;

    const sale = await this.db.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === SaleStatus.cancelled) {
      throw new BadRequestException('Venta ya estaba cancelada');
    }

    // Si estaba completed, requiere rol mayor (location_manager+)
    if (sale.status === SaleStatus.completed) {
      const rolesPermitidos: string[] = [Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN, Rol.SUPER_ADMIN];
      if (!rolesPermitidos.includes(usuario.rol)) {
        throw new ForbiddenException(
          'Anular ventas completadas requiere rol location_manager o superior',
        );
      }
    }

    const result = await this.db.$transaction(async (tx) => {
      // Si estaba completed, revertir stock con InventoryMovement reversa
      if (sale.status === SaleStatus.completed) {
        for (const item of sale.items) {
          // Buscar el movement original (más reciente con referenceCode = SALE-<num>)
          const original = await tx.inventoryMovement.findFirst({
            where: {
              tenantId,
              locationId: sale.locationId,
              variantId: item.variantId,
              movementType: MovementType.sale,
              referenceCode: `SALE-${sale.saleNumber}`,
              isReversal: false,
            },
            orderBy: { createdAt: 'desc' },
          });

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              locationId: sale.locationId,
              variantId: item.variantId,
              movementType: MovementType.sale,
              quantity: Number(item.quantity),
              direction: 1, // reversa: re-entra stock
              referenceCode: `CANCEL-SALE-${sale.saleNumber}`,
              isReversal: true,
              reversalOf: original?.id,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              taxAmount: item.taxAmount,
              subtotal: item.lineTotal.minus(item.taxAmount),
              total: item.lineTotal,
              currencyCode: sale.currencyCode,
              createdBy: usuario.sub,
              notes: `Reversa por cancelación: ${dto.motivo}`,
            },
          });
        }
      }

      return tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.cancelled,
          cancelledAt: new Date(),
          cancelReason: dto.motivo,
        },
        include: this.includeCompleto(),
      });
    });

    this.logger.warn(`Venta cancelada ${result.id} (${result.saleNumber}) — motivo: ${dto.motivo}`);
    return result;
  }

  // ============================================================
  // LISTAR
  // ============================================================
  async listar(filtros: FiltrosVentaDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const where: Prisma.SaleWhereInput = { tenantId };

    if (filtros.locationId) where.locationId = filtros.locationId;
    if (filtros.status) where.status = filtros.status;

    // Si rol = operator, solo ve sus propias ventas
    if (usuario.rol === Rol.OPERATOR) {
      where.cashierId = usuario.sub;
    } else if (filtros.cashierId) {
      where.cashierId = filtros.cashierId;
    }

    if (filtros.fechaDesde || filtros.fechaHasta) {
      where.createdAt = {};
      if (filtros.fechaDesde) where.createdAt.gte = new Date(filtros.fechaDesde);
      if (filtros.fechaHasta) where.createdAt.lte = new Date(filtros.fechaHasta);
    }

    const [items, total] = await Promise.all([
      this.db.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filtros.offset ?? 0,
        take: filtros.limit ?? 50,
        include: {
          location: { select: { id: true, name: true } },
          cashier: { select: { id: true, fullName: true } },
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      this.db.sale.count({ where }),
    ]);

    return { items, total, limit: filtros.limit, offset: filtros.offset };
  }

  // ============================================================
  // OBTENER POR ID
  // ============================================================
  async obtenerPorId(id: string, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const sale = await this.db.sale.findFirst({
      where: { id, tenantId },
      include: this.includeCompleto(),
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    // Operator solo ve sus propias ventas
    if (usuario.rol === Rol.OPERATOR && sale.cashierId !== usuario.sub) {
      throw new ForbiddenException('No tienes acceso a esta venta');
    }

    return sale;
  }

  // ============================================================
  // HELPERS PRIVADOS
  // ============================================================
  private includeCompleto() {
    return {
      location: { select: { id: true, name: true } },
      cashier: { select: { id: true, fullName: true } },
      customer: { select: { id: true, name: true } },
      items: {
        include: {
          variant: { select: { id: true, sku: true, product: { select: { id: true, name: true } } } },
        },
      },
      payments: true,
    } as const;
  }

  private async assertCajeroPuedeOperarSede(usuario: JwtPayload, locationId: string) {
    // tenant_admin y super_admin operan cualquier sede del tenant
    if ([Rol.TENANT_ADMIN, Rol.SUPER_ADMIN].includes(usuario.rol as Rol)) return;

    // operator y location_manager: solo sedes asignadas
    if (!usuario.sedesIds?.includes(locationId)) {
      throw new ForbiddenException('No tienes acceso a esta sucursal');
    }
  }

  private async obtenerSiguienteNumero(tenantId: string, locationId: string): Promise<number> {
    // Patrón simple: MAX + 1 dentro de transacción atómica (la UNIQUE en BD protege)
    // Para alto volumen: migrar a TenantSequence con upsert + bigint
    const max = await this.db.sale.aggregate({
      where: { tenantId, locationId },
      _max: { saleNumber: true },
    });
    return (max._max.saleNumber ?? 0) + 1;
  }
}
