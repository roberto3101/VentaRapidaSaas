import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { PaymentStrategyRegistry } from './strategies/payment-strategy.registry';
import { IniciarPagoDto } from './dto/iniciar-pago.dto';
import { AnularPagoDto } from './dto/anular-pago.dto';
import { ReembolsarPagoDto } from './dto/reembolsar-pago.dto';
import { CrearStoreCreditDto } from './dto/crear-store-credit.dto';
import { FiltrosPagoDto } from './dto/filtros-pago.dto';
import { Rol } from '../../common/constantes/roles.constant';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly strategies: PaymentStrategyRegistry,
  ) {}

  // ============================================================
  // INICIAR
  // ============================================================
  async iniciar(dto: IniciarPagoDto, usuario: JwtPayload): Promise<Payment> {
    const tenantId = usuario.tenantId!;

    // Idempotencia: si key + tenant ya existe → devolver el mismo Payment (no duplicar)
    if (dto.idempotencyKey) {
      const existente = await this.db.payment.findFirst({
        where: { tenantId, idempotencyKey: dto.idempotencyKey },
      });
      if (existente) {
        this.logger.log(`Idempotency hit ${dto.idempotencyKey} → payment ${existente.id}`);
        return existente;
      }
    }

    // Validar saleId si viene
    if (dto.saleId) {
      const sale = await this.db.sale.findFirst({
        where: { id: dto.saleId, tenantId },
        select: { id: true, status: true },
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === 'cancelled') {
        throw new BadRequestException('No se puede pagar una venta cancelada');
      }
    }

    const strategy = this.strategies.resolver(dto.method);
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.isZero() || amount.isNegative()) {
      throw new BadRequestException('amount debe ser > 0');
    }

    try {
      return await this.db.$transaction(
        (tx) =>
          strategy.iniciar({
            tenantId,
            saleId: dto.saleId ?? null,
            locationId: dto.locationId ?? null,
            cashShiftId: dto.cashShiftId ?? null,
            storeCreditId: dto.storeCreditId ?? null,
            amount,
            currencyCode: dto.currencyCode,
            receivedAmount: dto.receivedAmount ? new Prisma.Decimal(dto.receivedAmount) : null,
            reference: dto.reference ?? null,
            idempotencyKey: dto.idempotencyKey ?? null,
            usuario,
            tx,
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
      );
    } catch (err) {
      // unique violation (idempotency) → race entre 2 requests simultáneos
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (dto.idempotencyKey) {
          const existente = await this.db.payment.findFirst({
            where: { tenantId, idempotencyKey: dto.idempotencyKey },
          });
          if (existente) return existente;
        }
        throw new ConflictException('Conflicto al persistir el pago');
      }
      throw err;
    }
  }

  // ============================================================
  // ANULAR (void)
  // ============================================================
  async anular(id: string, dto: AnularPagoDto, usuario: JwtPayload): Promise<Payment> {
    const tenantId = usuario.tenantId!;
    const payment = await this.db.payment.findFirst({ where: { id, tenantId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');

    const strategy = this.strategies.resolver(payment.method);
    return await this.db.$transaction(
      (tx) => strategy.anular({ payment, reason: dto.motivo, usuario, tx }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5_000 },
    );
  }

  // ============================================================
  // REEMBOLSAR
  // ============================================================
  async reembolsar(
    id: string,
    dto: ReembolsarPagoDto,
    usuario: JwtPayload,
  ): Promise<Payment> {
    const tenantId = usuario.tenantId!;

    // Reembolso requiere rol manager+
    const rolesPermitidos: string[] = [Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN, Rol.SUPER_ADMIN];
    if (!rolesPermitidos.includes(usuario.rol)) {
      throw new ForbiddenException('Reembolsar pagos requiere rol location_manager o superior');
    }

    const payment = await this.db.payment.findFirst({ where: { id, tenantId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');

    const strategy = this.strategies.resolver(payment.method);
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.isZero() || amount.isNegative()) {
      throw new BadRequestException('amount debe ser > 0');
    }

    return await this.db.$transaction(
      (tx) =>
        strategy.reembolsar({
          payment,
          amount,
          reason: dto.motivo,
          cashShiftId: dto.cashShiftId ?? null,
          usuario,
          tx,
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
    );
  }

  // ============================================================
  // STORE CREDITS — crear (manager+) / listar
  // ============================================================
  async crearStoreCredit(dto: CrearStoreCreditDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const rolesPermitidos: string[] = [Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN, Rol.SUPER_ADMIN];
    if (!rolesPermitidos.includes(usuario.rol)) {
      throw new ForbiddenException('Crear crédito en cuenta requiere rol manager o superior');
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.isZero() || amount.isNegative()) {
      throw new BadRequestException('amount debe ser > 0');
    }

    const credit = await this.db.storeCredit.create({
      data: {
        tenantId,
        customerId: dto.customerId ?? null,
        locationId: dto.locationId ?? null,
        originalAmount: amount,
        balance: amount,
        currencyCode: dto.currencyCode,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        notes: dto.notes ?? null,
        createdById: usuario.sub,
      },
    });
    this.logger.log(
      `StoreCredit ${credit.id} created ${dto.currencyCode} ${dto.amount} customer=${dto.customerId ?? 'anon'}`,
    );
    return credit;
  }

  async listarStoreCredits(filtros: { customerId?: string; status?: string }, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    return this.db.storeCredit.findMany({
      where: {
        tenantId,
        ...(filtros.customerId ? { customerId: filtros.customerId } : {}),
        ...(filtros.status ? { status: filtros.status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ============================================================
  // LIST + DETAIL
  // ============================================================
  async listar(filtros: FiltrosPagoDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const where: Prisma.PaymentWhereInput = { tenantId };

    if (filtros.saleId) where.saleId = filtros.saleId;
    if (filtros.cashShiftId) where.cashShiftId = filtros.cashShiftId;
    if (filtros.method) where.method = filtros.method;
    if (filtros.status) where.status = filtros.status;
    if (filtros.fechaDesde || filtros.fechaHasta) {
      where.createdAt = {};
      if (filtros.fechaDesde) where.createdAt.gte = new Date(filtros.fechaDesde);
      if (filtros.fechaHasta) where.createdAt.lte = new Date(filtros.fechaHasta);
    }

    // operator solo ve los suyos
    if (usuario.rol === Rol.OPERATOR) where.createdById = usuario.sub;

    const [items, total] = await Promise.all([
      this.db.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filtros.offset ?? 0,
        take: filtros.limit ?? 50,
      }),
      this.db.payment.count({ where }),
    ]);

    return { items, total, limit: filtros.limit, offset: filtros.offset };
  }

  async obtenerPorId(id: string, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const payment = await this.db.payment.findFirst({
      where: { id, tenantId },
      include: { refunds: true, refundOfPayment: true, storeCredit: true },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');

    // operator solo ve los suyos
    if (usuario.rol === Rol.OPERATOR && payment.createdById !== usuario.sub) {
      throw new ForbiddenException('No puedes ver pagos de otros usuarios');
    }
    return payment;
  }
}
