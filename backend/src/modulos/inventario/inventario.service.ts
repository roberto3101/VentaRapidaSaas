import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto';
import { ConsultaStockDto } from './dto/consulta-stock.dto';
import { obtenerDireccion } from '../../common/constantes/tipos-movimiento.constant';
import { calcularImpuestos } from '../../common/utils/calculador-impuestos.util';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(private readonly db: DatabaseService) {}

  async crearMovimiento(dto: CrearMovimientoDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const direccion = obtenerDireccion(dto.tipoMovimiento);

    const tenant = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const tipoPrecio = direccion === 1 ? 'purchase' : 'sale';
    const precioUnitario = dto.precioUnitario
      ?? await this.db.obtenerPrecioEfectivo(dto.varianteId, dto.sedeId, tipoPrecio as any);

    const tasaImpuesto = await this.db.obtenerTasaImpuestoEfectiva(tenantId, dto.sedeId);

    const calculo = calcularImpuestos(
      dto.cantidad, precioUnitario, Number(tasaImpuesto), tenant.taxIncluded ?? true,
    );

    const requiereCheckStock = direccion === -1 && !tenant.allowNegativeStock;

    // Race-safe path: outbound movements that cannot oversell must lock the
    // inventory_stock row before the movement insert, so concurrent sales on
    // the same (variantId, locationId) pair serialize on the DB.
    // See SIS-24. Pending swap to fn_apply_movement once DBA delivers it.
    const movimiento = await this.db.$transaction(async (tx) => {
      if (requiereCheckStock) {
        const filas = await tx.$queryRaw<Array<{ available_quantity: number }>>`
          SELECT available_quantity
          FROM inventory_stock
          WHERE variant_id = ${dto.varianteId}::uuid
            AND location_id = ${dto.sedeId}::uuid
          FOR UPDATE
        `;

        const disponible = Number(filas[0]?.available_quantity ?? 0);
        if (disponible < dto.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente. Disponible: ${disponible}, Solicitado: ${dto.cantidad}`,
          );
        }
      }

      return tx.inventoryMovement.create({
        data: {
          tenantId,
          locationId: dto.sedeId,
          variantId: dto.varianteId,
          movementType: dto.tipoMovimiento as any,
          quantity: dto.cantidad,
          direction: direccion,
          contactId: dto.contactoId,
          transferId: dto.transferenciaId,
          referenceCode: dto.codigoReferencia,
          unitCost: direccion === 1 ? precioUnitario : null,
          unitPrice: direccion === -1 ? precioUnitario : null,
          taxRate: calculo.tasaImpuesto,
          taxAmount: calculo.montoImpuesto,
          subtotal: calculo.subtotal,
          total: calculo.total,
          currencyCode: tenant.currencyCode,
          notes: dto.notas,
          createdBy: usuario.sub,
        },
        include: {
          variant: { include: { product: true } },
          location: true,
          contact: true,
          creator: { select: { id: true, fullName: true } },
        },
      });
    });

    this.logger.log(
      `Movimiento ${dto.tipoMovimiento} creado: ${dto.cantidad} unidades, variante ${dto.varianteId}, sede ${dto.sedeId}`,
    );

    return movimiento;
  }

  async revertirMovimiento(movimientoId: string, razon: string, usuario: JwtPayload) {
    const original = await this.db.inventoryMovement.findUnique({
      where: { id: movimientoId },
    });

    if (!original) throw new NotFoundException('Movimiento no encontrado');
    if (original.isReversal) throw new BadRequestException('No se puede revertir una reversión');

    const yaTieneReversion = await this.db.inventoryMovement.findFirst({
      where: { reversalOf: movimientoId },
    });
    if (yaTieneReversion) throw new BadRequestException('Este movimiento ya fue revertido');

    return this.db.inventoryMovement.create({
      data: {
        tenantId: original.tenantId,
        locationId: original.locationId,
        variantId: original.variantId,
        movementType: original.movementType,
        quantity: original.quantity,
        direction: (original.direction * -1) as any,
        contactId: original.contactId,
        transferId: original.transferId,
        referenceCode: original.referenceCode,
        unitCost: original.unitCost,
        unitPrice: original.unitPrice,
        taxRate: original.taxRate,
        taxAmount: original.taxAmount,
        subtotal: original.subtotal,
        total: original.total,
        currencyCode: original.currencyCode,
        notes: `REVERSIÓN: ${razon}`,
        createdBy: usuario.sub,
        isReversal: true,
        reversalOf: movimientoId,
      },
      include: { variant: { include: { product: true } }, location: true },
    });
  }

  async obtenerStock(tenantId: string, filtros: ConsultaStockDto) {
    return this.db.obtenerStockDetallado({
      tenantId,
      locationId: filtros.sedeId,
      soloStockBajo: filtros.soloStockBajo,
      soloAgotados: filtros.soloAgotados,
      busqueda: filtros.busqueda,
      limite: filtros.take,
      offset: filtros.skip,
    });
  }

  async obtenerMovimientos(tenantId: string, filtros: { sedeId?: string; tipo?: string; limite?: number; offset?: number }) {
    return this.db.obtenerMovimientosRecientes({
      tenantId,
      locationId: filtros.sedeId,
      tipo: filtros.tipo,
      limite: filtros.limite ?? 50,
      offset: filtros.offset ?? 0,
    });
  }

  async obtenerStockPorVarianteYSede(varianteId: string, sedeId: string) {
    const stock = await this.db.inventoryStock.findUnique({
      where: { variantId_locationId: { variantId: varianteId, locationId: sedeId } },
    });
    return stock ?? { variantId: varianteId, locationId: sedeId, quantity: 0, reservedQuantity: 0, availableQuantity: 0 };
  }
}
