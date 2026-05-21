import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Prisma, ReceiptStatus, ReceiptType, SaleStatus } from '@prisma/client';
import { EmitirComprobanteDto } from './dto/emitir-comprobante.dto';
import { AnularComprobanteDto } from './dto/anular-comprobante.dto';
import { FiltrosComprobanteDto } from './dto/filtros-comprobante.dto';
import { Rol } from '../../common/constantes/roles.constant';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

const SERIE_DEFAULT_POR_TIPO: Record<ReceiptType, string> = {
  ticket: 'T001',
  boleta: 'B001',
  factura: 'F001',
  nota_credito: 'NC01',
  nota_debito: 'ND01',
};

@Injectable()
export class ComprobantesService {
  private readonly logger = new Logger(ComprobantesService.name);

  constructor(private readonly db: DatabaseService) {}

  async emitir(dto: EmitirComprobanteDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;

    // 1. Cargar la venta y validar
    const sale = await this.db.sale.findFirst({
      where: { id: dto.saleId, tenantId },
      include: {
        items: {
          include: { variant: { include: { product: { select: { name: true } } } } },
        },
        payments: true,
        customer: true,
        location: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status !== SaleStatus.completed) {
      throw new BadRequestException(
        `Solo ventas completadas pueden generar comprobantes (status actual: ${sale.status})`,
      );
    }

    // 2. Validar tipo + datos cliente requeridos
    if ((dto.type === ReceiptType.factura) && !dto.customerDocNumber) {
      throw new BadRequestException('Factura requiere documento del cliente');
    }

    const serie = dto.series ?? SERIE_DEFAULT_POR_TIPO[dto.type];
    const tenant = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    // 3. Transacción: número correlativo + create
    const result = await this.db.$transaction(async (tx) => {
      const max = await tx.receipt.aggregate({
        where: { tenantId, locationId: sale.locationId, type: dto.type, series: serie },
        _max: { number: true },
      });
      const number = (max._max.number ?? 0) + 1;

      // Snapshot cliente
      const customerDocType = dto.customerDocType ?? sale.customer?.documentType ?? null;
      const customerDocNumber = dto.customerDocNumber ?? sale.customer?.documentNumber ?? null;
      const customerName = dto.customerName ?? sale.customer?.name ?? null;
      const customerAddress = dto.customerAddress ?? sale.customer?.address ?? null;

      // Construir payload imprimible
      const payload = {
        tenant: {
          name: tenant.name,
          countryCode: tenant.countryCode,
          taxName: tenant.taxName ?? 'IGV',
        },
        location: {
          name: sale.location.name,
          address: sale.location.address ?? null,
        },
        type: dto.type,
        serie,
        number: String(number).padStart(8, '0'),
        issuedAt: new Date().toISOString(),
        customer: customerDocNumber
          ? { docType: customerDocType, docNumber: customerDocNumber, name: customerName, address: customerAddress }
          : null,
        items: sale.items.map((i) => ({
          sku: i.productSku,
          name: i.productName,
          qty: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          taxRate: Number(i.taxRate),
          taxAmount: Number(i.taxAmount),
          discountAmount: i.discountAmount ? Number(i.discountAmount) : 0,
          lineTotal: Number(i.lineTotal),
        })),
        subtotal: Number(sale.subtotal),
        taxAmount: Number(sale.taxAmount),
        discountAmount: sale.discountAmount ? Number(sale.discountAmount) : 0,
        total: Number(sale.total),
        currency: sale.currencyCode,
        paymentMethods: sale.payments.map((p) => p.method),
      };

      return tx.receipt.create({
        data: {
          tenantId,
          locationId: sale.locationId,
          saleId: sale.id,
          type: dto.type,
          series: serie,
          number,
          status: ReceiptStatus.issued, // MVP: directo. Fase 4: 'draft' hasta CDR de SUNAT
          customerDocType,
          customerDocNumber,
          customerName,
          customerAddress,
          subtotal: sale.subtotal,
          taxAmount: sale.taxAmount,
          total: sale.total,
          currencyCode: sale.currencyCode,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          issuedAt: new Date(),
        },
      });
    });

    this.logger.log(
      `Comprobante emitido ${result.type} ${result.series}-${String(result.number).padStart(8, '0')} (sale ${sale.id})`,
    );
    return result;
  }

  async anular(receiptId: string, dto: AnularComprobanteDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;

    const rolesPermitidos: string[] = [Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN, Rol.SUPER_ADMIN];
    if (!rolesPermitidos.includes(usuario.rol)) {
      throw new ForbiddenException('Anular comprobantes requiere rol location_manager o superior');
    }

    const receipt = await this.db.receipt.findFirst({ where: { id: receiptId, tenantId } });
    if (!receipt) throw new NotFoundException('Comprobante no encontrado');
    if (receipt.status === ReceiptStatus.voided) {
      throw new BadRequestException('Comprobante ya está anulado');
    }

    const updated = await this.db.receipt.update({
      where: { id: receipt.id },
      data: {
        status: ReceiptStatus.voided,
        voidedAt: new Date(),
        voidReason: dto.motivo,
      },
    });

    this.logger.warn(
      `Comprobante anulado ${updated.type} ${updated.series}-${String(updated.number).padStart(8, '0')} — motivo: ${dto.motivo}`,
    );
    return updated;
  }

  async listar(filtros: FiltrosComprobanteDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const where: Prisma.ReceiptWhereInput = { tenantId };

    if (filtros.locationId) where.locationId = filtros.locationId;
    if (filtros.type) where.type = filtros.type;
    if (filtros.status) where.status = filtros.status;
    if (filtros.fechaDesde || filtros.fechaHasta) {
      where.createdAt = {};
      if (filtros.fechaDesde) where.createdAt.gte = new Date(filtros.fechaDesde);
      if (filtros.fechaHasta) where.createdAt.lte = new Date(filtros.fechaHasta);
    }

    const [items, total] = await Promise.all([
      this.db.receipt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filtros.offset ?? 0,
        take: filtros.limit ?? 50,
        select: {
          id: true,
          type: true,
          series: true,
          number: true,
          status: true,
          customerName: true,
          customerDocNumber: true,
          total: true,
          currencyCode: true,
          issuedAt: true,
          voidedAt: true,
          saleId: true,
          locationId: true,
        },
      }),
      this.db.receipt.count({ where }),
    ]);

    return { items, total, limit: filtros.limit, offset: filtros.offset };
  }

  async obtenerPorId(id: string, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const receipt = await this.db.receipt.findFirst({
      where: { id, tenantId },
      include: {
        location: { select: { id: true, name: true } },
        sale: { select: { id: true, saleNumber: true, status: true } },
      },
    });
    if (!receipt) throw new NotFoundException('Comprobante no encontrado');
    return receipt;
  }

  async obtenerPayload(id: string, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const receipt = await this.db.receipt.findFirst({
      where: { id, tenantId },
      select: { payloadJson: true, status: true },
    });
    if (!receipt) throw new NotFoundException('Comprobante no encontrado');
    return { payload: receipt.payloadJson, status: receipt.status };
  }
}
