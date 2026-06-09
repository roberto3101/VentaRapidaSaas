import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  StoreCreditStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';
import {
  AnularInput,
  IPaymentStrategy,
  IniciarPagoInput,
  ReembolsarInput,
} from './payment-strategy.interface';

/**
 * StoreCredit — síncrono. Decrementa balance de un StoreCredit activo del cliente.
 * Refund incrementa el balance del StoreCredit original (o crea uno nuevo si fue consumido).
 */
@Injectable()
export class StoreCreditPaymentStrategy implements IPaymentStrategy {
  private readonly logger = new Logger(StoreCreditPaymentStrategy.name);
  readonly method = PaymentMethod.store_credit;
  readonly requiresOnlineConfirmation = false;

  constructor(private readonly db: DatabaseService) {}

  async iniciar(input: IniciarPagoInput): Promise<Payment> {
    const client = input.tx ?? this.db;

    if (!input.storeCreditId) {
      throw new BadRequestException(
        'storeCreditId requerido para pagar con crédito en cuenta',
      );
    }

    const credit = await client.storeCredit.findFirst({
      where: { id: input.storeCreditId, tenantId: input.tenantId },
    });
    if (!credit) throw new NotFoundException('Crédito en cuenta no encontrado');
    if (credit.status !== StoreCreditStatus.active) {
      throw new BadRequestException(`Crédito en estado ${credit.status} no usable`);
    }
    if (credit.currencyCode !== input.currencyCode) {
      throw new BadRequestException(
        `Currency del crédito (${credit.currencyCode}) ≠ pago (${input.currencyCode})`,
      );
    }
    if (credit.expiresAt && credit.expiresAt < new Date()) {
      throw new BadRequestException('Crédito expirado');
    }
    const balance = new Prisma.Decimal(credit.balance.toString());
    if (input.amount.greaterThan(balance)) {
      throw new BadRequestException(
        `Saldo insuficiente (disponible ${balance.toString()}, solicitado ${input.amount.toString()})`,
      );
    }

    const nuevoBalance = balance.minus(input.amount);
    const newStatus = nuevoBalance.isZero() ? StoreCreditStatus.used : StoreCreditStatus.active;
    const now = new Date();

    const payment = await client.payment.create({
      data: {
        tenantId: input.tenantId,
        saleId: input.saleId ?? null,
        locationId: input.locationId ?? null,
        method: PaymentMethod.store_credit,
        status: PaymentStatus.captured,
        amount: input.amount,
        currencyCode: input.currencyCode,
        storeCreditId: credit.id,
        idempotencyKey: input.idempotencyKey ?? null,
        capturedAt: now,
        createdById: input.usuario.sub,
        reference: input.reference ?? null,
      },
    });

    await client.storeCredit.update({
      where: { id: credit.id },
      data: { balance: nuevoBalance, status: newStatus },
    });

    this.logger.log(
      `StoreCredit captured ${input.currencyCode} ${input.amount.toString()} credit=${credit.id} payment=${payment.id}`,
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
    if (!payment.storeCreditId) {
      throw new BadRequestException('Payment sin storeCreditId — no se puede revertir crédito');
    }
    const yaReembolsado = payment.refundedAmount ?? new Prisma.Decimal(0);
    const disponible = new Prisma.Decimal(payment.amount.toString()).minus(yaReembolsado);
    if (input.amount.greaterThan(disponible)) {
      throw new BadRequestException(
        `Monto a reembolsar excede disponible (${disponible.toString()})`,
      );
    }

    const credit = await client.storeCredit.findUniqueOrThrow({
      where: { id: payment.storeCreditId },
    });
    const now = new Date();
    const nuevoTotalReembolsado = yaReembolsado.plus(input.amount);
    const esTotal = nuevoTotalReembolsado.equals(payment.amount);

    // Crear refund Payment hermano
    const refundPayment = await client.payment.create({
      data: {
        tenantId: payment.tenantId,
        saleId: payment.saleId,
        locationId: payment.locationId,
        method: PaymentMethod.store_credit,
        status: PaymentStatus.captured,
        amount: input.amount.negated(),
        currencyCode: payment.currencyCode,
        storeCreditId: credit.id,
        refundOfPaymentId: payment.id,
        reference: input.reason,
        capturedAt: now,
        createdById: input.usuario.sub,
      },
    });

    // Devolver al balance del credit (re-activar si estaba 'used')
    const nuevoBalance = new Prisma.Decimal(credit.balance.toString()).plus(input.amount);
    await client.storeCredit.update({
      where: { id: credit.id },
      data: {
        balance: nuevoBalance,
        status:
          credit.status === StoreCreditStatus.used && nuevoBalance.greaterThan(0)
            ? StoreCreditStatus.active
            : credit.status,
      },
    });

    await client.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: nuevoTotalReembolsado,
        refundedAt: now,
        status: esTotal ? PaymentStatus.refunded : payment.status,
      },
    });

    this.logger.log(
      `StoreCredit refund ${payment.currencyCode} ${input.amount.toString()} of=${payment.id} credit=${credit.id}`,
    );
    return refundPayment;
  }

  async anular(input: AnularInput): Promise<Payment> {
    const client = input.tx ?? this.db;
    const { payment } = input;

    if (payment.status === PaymentStatus.captured) {
      throw new BadRequestException('No se puede anular un pago capturado. Usa reembolsar.');
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
    this.logger.warn(`StoreCredit payment voided ${payment.id}: ${input.reason}`);
    return updated;
  }
}
