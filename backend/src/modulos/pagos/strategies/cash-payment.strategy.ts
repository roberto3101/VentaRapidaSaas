import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CashMovementReason,
  CashMovementType,
  CashShiftStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';
import {
  AnularInput,
  IPaymentStrategy,
  IniciarPagoInput,
  ReembolsarInput,
} from './payment-strategy.interface';

/**
 * Cash — síncrono. Status va directo a `captured` al crear.
 * Genera CashMovement(in, sale) en el turno activo del cajero.
 * Refund genera CashMovement(out, refund) en el turno activo del REFUND'er
 * (puede ser distinto al cajero original).
 */
@Injectable()
export class CashPaymentStrategy implements IPaymentStrategy {
  private readonly logger = new Logger(CashPaymentStrategy.name);
  readonly method = PaymentMethod.cash;
  readonly requiresOnlineConfirmation = false;

  constructor(private readonly db: DatabaseService) {}

  async iniciar(input: IniciarPagoInput): Promise<Payment> {
    const client = input.tx ?? this.db;

    // Cash REQUIERE turno activo
    const turno = input.cashShiftId
      ? await client.cashShift.findFirst({
          where: { id: input.cashShiftId, tenantId: input.tenantId, status: CashShiftStatus.open },
        })
      : await client.cashShift.findFirst({
          where: {
            tenantId: input.tenantId,
            userId: input.usuario.sub,
            status: CashShiftStatus.open,
            ...(input.locationId ? { locationId: input.locationId } : {}),
          },
          orderBy: { openedAt: 'desc' },
        });

    if (!turno) {
      throw new BadRequestException(
        'No tienes un turno de caja abierto. Abre uno antes de cobrar en efectivo.',
      );
    }

    // Validar la currency del turno coincide con el balance abierto
    const tieneCurrency = await client.cashShiftBalance.findFirst({
      where: { cashShiftId: turno.id, currencyCode: input.currencyCode },
      select: { id: true },
    });
    if (!tieneCurrency) {
      throw new BadRequestException(
        `Tu turno no tiene balance abierto para ${input.currencyCode}`,
      );
    }

    const now = new Date();
    const change =
      input.receivedAmount && input.receivedAmount.greaterThan(input.amount)
        ? input.receivedAmount.minus(input.amount)
        : new Prisma.Decimal(0);

    const payment = await client.payment.create({
      data: {
        tenantId: input.tenantId,
        saleId: input.saleId ?? null,
        locationId: input.locationId ?? turno.locationId,
        cashShiftId: turno.id,
        method: PaymentMethod.cash,
        status: PaymentStatus.captured,
        amount: input.amount,
        currencyCode: input.currencyCode,
        receivedAmount: input.receivedAmount ?? null,
        changeAmount: change.isZero() ? null : change,
        reference: input.reference ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        capturedAt: now,
        createdById: input.usuario.sub,
      },
    });

    await client.cashMovement.create({
      data: {
        cashShiftId: turno.id,
        type: CashMovementType.in,
        reason: CashMovementReason.sale,
        amount: input.amount, // SOLO el cobrado, no el received (el change ya se devuelve)
        currencyCode: input.currencyCode,
        referenceType: 'payment',
        referenceId: payment.id,
        authorizedById: input.usuario.sub,
      },
    });

    this.logger.log(
      `Cash captured ${input.currencyCode} ${input.amount.toString()} payment=${payment.id} shift=${turno.id}`,
    );
    return payment;
  }

  async reembolsar(input: ReembolsarInput): Promise<Payment> {
    const client = input.tx ?? this.db;
    const { payment } = input;

    if (payment.status !== PaymentStatus.captured) {
      throw new BadRequestException(
        `Solo se reembolsa un pago capturado (estado actual: ${payment.status})`,
      );
    }
    const yaReembolsado = payment.refundedAmount ?? new Prisma.Decimal(0);
    const disponible = new Prisma.Decimal(payment.amount.toString()).minus(yaReembolsado);
    if (input.amount.greaterThan(disponible)) {
      throw new BadRequestException(
        `Monto a reembolsar excede disponible (${disponible.toString()})`,
      );
    }

    // Buscar turno activo del refund'er
    const turno = input.cashShiftId
      ? await client.cashShift.findFirst({
          where: { id: input.cashShiftId, tenantId: payment.tenantId, status: CashShiftStatus.open },
        })
      : await client.cashShift.findFirst({
          where: {
            tenantId: payment.tenantId,
            userId: input.usuario.sub,
            status: CashShiftStatus.open,
          },
          orderBy: { openedAt: 'desc' },
        });
    if (!turno) {
      throw new BadRequestException(
        'No tienes turno abierto para reembolsar en efectivo. Abre uno antes.',
      );
    }

    const now = new Date();
    const nuevoTotalReembolsado = yaReembolsado.plus(input.amount);
    const esTotal = nuevoTotalReembolsado.equals(payment.amount);

    // Crear Payment refund (registro hermano)
    const refundPayment = await client.payment.create({
      data: {
        tenantId: payment.tenantId,
        saleId: payment.saleId,
        locationId: turno.locationId,
        cashShiftId: turno.id,
        method: PaymentMethod.cash,
        status: PaymentStatus.captured, // el refund en sí está capturado (salió plata)
        amount: input.amount.negated(), // negativo para distinguir refund
        currencyCode: payment.currencyCode,
        refundOfPaymentId: payment.id,
        reference: input.reason,
        capturedAt: now,
        createdById: input.usuario.sub,
      },
    });

    // Actualizar el payment original
    await client.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: nuevoTotalReembolsado,
        refundedAt: now,
        status: esTotal ? PaymentStatus.refunded : payment.status,
      },
    });

    // CashMovement(out, refund) en el turno actual del refund'er
    await client.cashMovement.create({
      data: {
        cashShiftId: turno.id,
        type: CashMovementType.out,
        reason: CashMovementReason.refund,
        amount: input.amount,
        currencyCode: payment.currencyCode,
        referenceType: 'payment_refund',
        referenceId: refundPayment.id,
        authorizedById: input.usuario.sub,
        notes: input.reason,
      },
    });

    this.logger.log(
      `Cash refund ${payment.currencyCode} ${input.amount.toString()} of=${payment.id} refund=${refundPayment.id}`,
    );
    return refundPayment;
  }

  async anular(input: AnularInput): Promise<Payment> {
    const client = input.tx ?? this.db;
    const { payment } = input;

    if (payment.status === PaymentStatus.captured) {
      throw new BadRequestException(
        'No se puede anular un pago capturado. Usa reembolsar.',
      );
    }
    if (payment.status === PaymentStatus.voided) {
      throw new BadRequestException('Pago ya está anulado');
    }

    const updated = await client.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.voided,
        voidedAt: new Date(),
        voidReason: input.reason,
      },
    });
    this.logger.warn(`Cash payment voided ${payment.id}: ${input.reason}`);
    return updated;
  }
}
