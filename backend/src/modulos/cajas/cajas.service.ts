import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementReason,
  CashMovementType,
  CashShiftStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';
import { AprobarDiferenciaDto } from './dto/aprobar-diferencia.dto';
import { FiltrosTurnoDto } from './dto/filtros-turno.dto';
import { Rol } from '../../common/constantes/roles.constant';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

/**
 * Umbral default de diferencia tolerada al cierre (per [[009-cash-shifts]]).
 * Valor en unidades de la currency — la app aplica el mismo umbral por currency.
 * TODO: leer de tenant.settings.cashShiftDiffThreshold cuando se modele.
 */
const DIFF_THRESHOLD_DEFAULT = new Prisma.Decimal('5.00');

/** Razones que NO puede crear el usuario directamente (las genera el sistema). */
const RAZONES_PROHIBIDAS_MANUAL = new Set<CashMovementReason>([
  CashMovementReason.initial,
  CashMovementReason.sale,
  CashMovementReason.refund,
  CashMovementReason.closing,
]);

@Injectable()
export class CajasService {
  private readonly logger = new Logger(CajasService.name);

  constructor(private readonly db: DatabaseService) {}

  // ============================================================
  // ABRIR
  // ============================================================
  async abrir(dto: AbrirTurnoDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const userId = usuario.sub;

    // Validar sede pertenece al tenant
    const sede = await this.db.location.findFirst({
      where: { id: dto.locationId, tenantId },
      select: { id: true },
    });
    if (!sede) throw new NotFoundException('Sede no encontrada');

    // Validar usuario no tiene OTRO turno abierto en cualquier sede
    const otroAbierto = await this.db.cashShift.findFirst({
      where: { tenantId, userId, status: CashShiftStatus.open },
      select: { id: true, locationId: true },
    });
    if (otroAbierto) {
      throw new BadRequestException(
        `Ya tienes un turno abierto en la sede ${otroAbierto.locationId}. Ciérralo antes.`,
      );
    }

    // Validar currencies únicas en la apertura
    const codes = new Set<string>();
    for (const m of dto.openingAmounts) {
      if (codes.has(m.currencyCode)) {
        throw new BadRequestException(
          `Currency duplicada en apertura: ${m.currencyCode}`,
        );
      }
      codes.add(m.currencyCode);
      const amt = new Prisma.Decimal(m.openingAmount);
      if (amt.isNegative()) {
        throw new BadRequestException(`openingAmount no puede ser negativo (${m.currencyCode})`);
      }
    }

    // Transacción: crear shift + balances + movimientos initial
    const turno = await this.db.$transaction(async (tx) => {
      const shift = await tx.cashShift.create({
        data: {
          tenantId,
          locationId: dto.locationId,
          userId,
          status: CashShiftStatus.open,
          notes: dto.notes ?? null,
        },
      });

      for (const m of dto.openingAmounts) {
        const amt = new Prisma.Decimal(m.openingAmount);
        await tx.cashShiftBalance.create({
          data: {
            cashShiftId: shift.id,
            currencyCode: m.currencyCode,
            openingAmount: amt,
          },
        });

        if (!amt.isZero()) {
          await tx.cashMovement.create({
            data: {
              cashShiftId: shift.id,
              type: CashMovementType.in,
              reason: CashMovementReason.initial,
              amount: amt,
              currencyCode: m.currencyCode,
              authorizedById: userId,
              notes: 'Apertura de turno',
            },
          });
        }
      }

      return tx.cashShift.findUnique({
        where: { id: shift.id },
        include: { balances: true },
      });
    });

    this.logger.log(`Turno abierto ${turno!.id} (user ${userId}, sede ${dto.locationId})`);
    return turno;
  }

  // ============================================================
  // CERRAR
  // ============================================================
  async cerrar(turnoId: string, dto: CerrarTurnoDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const userId = usuario.sub;

    const turno = await this.db.cashShift.findFirst({
      where: { id: turnoId, tenantId },
      include: { balances: true },
    });
    if (!turno) throw new NotFoundException('Turno no encontrado');
    if (turno.status !== CashShiftStatus.open) {
      throw new BadRequestException(`Turno ya no está abierto (status=${turno.status})`);
    }
    // Solo el dueño del turno cierra (manager puede aprobar después)
    if (turno.userId !== userId && usuario.rol !== Rol.SUPER_ADMIN) {
      throw new ForbiddenException('Solo el dueño del turno puede cerrarlo');
    }

    // Validar que cada currency declarada existe en el turno
    const balancesByCurrency = new Map(turno.balances.map((b) => [b.currencyCode, b]));
    for (const a of dto.actualAmounts) {
      if (!balancesByCurrency.has(a.currencyCode)) {
        throw new BadRequestException(
          `Currency ${a.currencyCode} no fue declarada en la apertura`,
        );
      }
    }
    if (dto.actualAmounts.length !== turno.balances.length) {
      throw new BadRequestException(
        'Debes declarar el monto contado de TODAS las currencies abiertas',
      );
    }

    // Calcular expected_amount por currency desde cash_movements
    const movimientos = await this.db.cashMovement.groupBy({
      by: ['currencyCode', 'type'],
      where: { cashShiftId: turnoId },
      _sum: { amount: true },
    });

    const expectedByCurrency = new Map<string, Prisma.Decimal>();
    for (const bal of turno.balances) {
      const ins = movimientos
        .filter((m) => m.currencyCode === bal.currencyCode && m.type === CashMovementType.in)
        .reduce((s, m) => s.plus(m._sum.amount ?? 0), new Prisma.Decimal(0));
      const outs = movimientos
        .filter((m) => m.currencyCode === bal.currencyCode && m.type === CashMovementType.out)
        .reduce((s, m) => s.plus(m._sum.amount ?? 0), new Prisma.Decimal(0));
      // expected = sum(in) − sum(out)  (initial ya está incluido en `in`)
      expectedByCurrency.set(bal.currencyCode, ins.minus(outs));
    }

    // Decidir status: si CUALQUIER diff excede umbral → pending_approval, sino reconciled
    let needsApproval = false;
    const updates: Array<{
      id: string;
      currency: string;
      expected: Prisma.Decimal;
      actual: Prisma.Decimal;
      diff: Prisma.Decimal;
    }> = [];

    for (const a of dto.actualAmounts) {
      const bal = balancesByCurrency.get(a.currencyCode)!;
      const expected = expectedByCurrency.get(a.currencyCode) ?? new Prisma.Decimal(0);
      const actual = new Prisma.Decimal(a.actualAmount);
      const diff = actual.minus(expected);
      if (diff.abs().greaterThan(DIFF_THRESHOLD_DEFAULT)) needsApproval = true;
      updates.push({ id: bal.id, currency: a.currencyCode, expected, actual, diff });
    }

    const newStatus = needsApproval
      ? CashShiftStatus.pending_approval
      : CashShiftStatus.reconciled;

    // Transacción: actualizar balances + cerrar turno
    const result = await this.db.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.cashShiftBalance.update({
          where: { id: u.id },
          data: { expectedAmount: u.expected, actualAmount: u.actual, difference: u.diff },
        });
      }
      return tx.cashShift.update({
        where: { id: turnoId },
        data: {
          status: newStatus,
          closedAt: new Date(),
          closedById: userId,
          notes: dto.notes ?? turno.notes,
        },
        include: { balances: true },
      });
    });

    this.logger.log(
      `Turno cerrado ${turnoId} status=${newStatus} ` +
        updates.map((u) => `${u.currency}=${u.diff.toString()}`).join(' '),
    );
    return result;
  }

  // ============================================================
  // GET ACTIVO (lo usa ventas para validar turno abierto)
  // ============================================================
  async obtenerTurnoActivo(usuario: JwtPayload, locationId?: string) {
    const tenantId = usuario.tenantId!;
    // orderBy defensivo: si hubiera más de uno open por bug, tomamos el más reciente
    return this.db.cashShift.findFirst({
      where: {
        tenantId,
        userId: usuario.sub,
        status: CashShiftStatus.open,
        ...(locationId ? { locationId } : {}),
      },
      include: { balances: true },
      orderBy: { openedAt: 'desc' },
    });
  }

  // ============================================================
  // REGISTRAR MOVIMIENTO MANUAL
  // ============================================================
  async registrarMovimiento(
    turnoId: string,
    dto: RegistrarMovimientoDto,
    usuario: JwtPayload,
  ) {
    if (RAZONES_PROHIBIDAS_MANUAL.has(dto.reason)) {
      throw new BadRequestException(
        `Razón ${dto.reason} es generada por el sistema, no se puede crear manualmente`,
      );
    }

    const tenantId = usuario.tenantId!;
    const turno = await this.db.cashShift.findFirst({
      where: { id: turnoId, tenantId },
      include: { balances: true },
    });
    if (!turno) throw new NotFoundException('Turno no encontrado');
    if (turno.status !== CashShiftStatus.open) {
      throw new BadRequestException('Movimientos solo en turnos abiertos');
    }
    // Permisos: dueño del turno O manager+
    const esDueno = turno.userId === usuario.sub;
    const esManager = [Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN, Rol.SUPER_ADMIN].includes(
      usuario.rol as Rol,
    );
    if (!esDueno && !esManager) {
      throw new ForbiddenException('No puedes operar este turno');
    }

    // Validar currency está en el turno
    if (!turno.balances.some((b) => b.currencyCode === dto.currencyCode)) {
      throw new BadRequestException(
        `Currency ${dto.currencyCode} no está abierta en este turno`,
      );
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.isNegative() || amount.isZero()) {
      throw new BadRequestException('amount debe ser positivo');
    }

    // adjustment requiere manager
    if (dto.reason === CashMovementReason.adjustment && !esManager) {
      throw new ForbiddenException('Ajustes requieren rol manager+');
    }

    const mov = await this.db.cashMovement.create({
      data: {
        cashShiftId: turnoId,
        type: dto.type,
        reason: dto.reason,
        amount,
        currencyCode: dto.currencyCode,
        authorizedById: usuario.sub,
        notes: dto.notes ?? null,
      },
    });

    this.logger.log(
      `Movimiento ${dto.type}/${dto.reason} ${dto.currencyCode} ${amount.toString()} en turno ${turnoId}`,
    );
    return mov;
  }

  // ============================================================
  // APROBAR / RECHAZAR DIFERENCIA
  // ============================================================
  async aprobarDiferencia(
    turnoId: string,
    dto: AprobarDiferenciaDto,
    usuario: JwtPayload,
  ) {
    const tenantId = usuario.tenantId!;

    // Solo manager+ puede aprobar
    const rolesPermitidos: string[] = [Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN, Rol.SUPER_ADMIN];
    if (!rolesPermitidos.includes(usuario.rol)) {
      throw new ForbiddenException('Aprobar diferencias requiere rol location_manager o superior');
    }

    const turno = await this.db.cashShift.findFirst({
      where: { id: turnoId, tenantId },
      include: { balances: true },
    });
    if (!turno) throw new NotFoundException('Turno no encontrado');
    if (turno.status !== CashShiftStatus.pending_approval) {
      throw new BadRequestException(
        `Turno no está en pending_approval (status=${turno.status})`,
      );
    }

    if (dto.approve) {
      // Aprobado: pasa a reconciled, registra movimiento `adjustment` por currency
      const result = await this.db.$transaction(async (tx) => {
        for (const bal of turno.balances) {
          if (bal.difference && !bal.difference.isZero()) {
            await tx.cashMovement.create({
              data: {
                cashShiftId: turnoId,
                type: bal.difference.isPositive() ? CashMovementType.in : CashMovementType.out,
                reason: CashMovementReason.adjustment,
                amount: bal.difference.abs(),
                currencyCode: bal.currencyCode,
                authorizedById: usuario.sub,
                notes: `Aprobación de diferencia: ${dto.notes}`,
              },
            });
          }
        }
        return tx.cashShift.update({
          where: { id: turnoId },
          data: {
            status: CashShiftStatus.reconciled,
            approvedAt: new Date(),
            approvedById: usuario.sub,
            notes: `${turno.notes ?? ''}\n[APROBADO] ${dto.notes}`.trim(),
          },
          include: { balances: true },
        });
      });
      this.logger.log(`Turno ${turnoId} diferencia APROBADA por ${usuario.sub}`);
      return result;
    } else {
      // Rechazado: vuelve a open para recontar
      const result = await this.db.cashShift.update({
        where: { id: turnoId },
        data: {
          status: CashShiftStatus.open,
          closedAt: null,
          closedById: null,
          notes: `${turno.notes ?? ''}\n[RECHAZADO recuento] ${dto.notes}`.trim(),
        },
        include: { balances: true },
      });
      // Limpiar expected/actual/diff para que vuelva a contar
      await this.db.cashShiftBalance.updateMany({
        where: { cashShiftId: turnoId },
        data: { expectedAmount: null, actualAmount: null, difference: null },
      });
      this.logger.warn(`Turno ${turnoId} RECHAZADO por ${usuario.sub}: ${dto.notes}`);
      return result;
    }
  }

  // ============================================================
  // LISTAR + DETALLE
  // ============================================================
  async listar(filtros: FiltrosTurnoDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const where: Prisma.CashShiftWhereInput = { tenantId };

    if (filtros.locationId) where.locationId = filtros.locationId;
    if (filtros.userId) where.userId = filtros.userId;
    if (filtros.status) where.status = filtros.status;
    if (filtros.fechaDesde || filtros.fechaHasta) {
      where.openedAt = {};
      if (filtros.fechaDesde) where.openedAt.gte = new Date(filtros.fechaDesde);
      if (filtros.fechaHasta) where.openedAt.lte = new Date(filtros.fechaHasta);
    }

    // operator solo ve los suyos; manager+ ve todos los de su sede/tenant
    if (usuario.rol === Rol.OPERATOR) where.userId = usuario.sub;

    const [items, total] = await Promise.all([
      this.db.cashShift.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: filtros.offset ?? 0,
        take: filtros.limit ?? 50,
        include: {
          balances: { select: { currencyCode: true, openingAmount: true, expectedAmount: true, actualAmount: true, difference: true } },
          user: { select: { id: true, fullName: true } },
          location: { select: { id: true, name: true } },
        },
      }),
      this.db.cashShift.count({ where }),
    ]);

    return { items, total, limit: filtros.limit, offset: filtros.offset };
  }

  async obtenerPorId(id: string, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const turno = await this.db.cashShift.findFirst({
      where: { id, tenantId },
      include: {
        balances: true,
        movements: { orderBy: { createdAt: 'desc' }, take: 200 },
        user: { select: { id: true, fullName: true } },
        location: { select: { id: true, name: true } },
        closedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!turno) throw new NotFoundException('Turno no encontrado');

    // operator solo puede ver los suyos
    if (usuario.rol === Rol.OPERATOR && turno.userId !== usuario.sub) {
      throw new ForbiddenException('No puedes ver turnos de otros usuarios');
    }
    return turno;
  }
}
