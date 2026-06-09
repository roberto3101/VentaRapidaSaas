import { Prisma, Payment, PaymentMethod, PaymentStatus } from '@prisma/client';
import type { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';

/**
 * Input genérico para iniciar un pago. Cada strategy interpreta lo que necesita.
 * `tx` es el TransactionClient de Prisma — el strategy DEBE usar este si está presente
 * (para que su trabajo participe en la transacción del caller, p.ej. CreateSale).
 */
export interface IniciarPagoInput {
  tenantId: string;
  locationId?: string | null;
  saleId?: string | null;
  amount: Prisma.Decimal;
  currencyCode: string;
  reference?: string | null;
  receivedAmount?: Prisma.Decimal | null;
  cashShiftId?: string | null;
  storeCreditId?: string | null;
  idempotencyKey?: string | null;
  usuario: JwtPayload;
  tx?: Prisma.TransactionClient;
}

export interface ReembolsarInput {
  payment: Payment;
  amount: Prisma.Decimal;
  reason: string;
  cashShiftId?: string | null; // turno del refund'er si method=cash
  usuario: JwtPayload;
  tx?: Prisma.TransactionClient;
}

export interface AnularInput {
  payment: Payment;
  reason: string;
  usuario: JwtPayload;
  tx?: Prisma.TransactionClient;
}

export interface IPaymentStrategy {
  /** Método al que esta strategy responde. */
  readonly method: PaymentMethod;

  /** ¿La captura es inmediata (cash, store_credit) o requiere confirmación async (yape, card)? */
  readonly requiresOnlineConfirmation: boolean;

  /** Crea el Payment row + side-effects (CashMovement, StoreCredit decrement, etc.) */
  iniciar(input: IniciarPagoInput): Promise<Payment>;

  /** Reembolsa total/parcial. Genera Payment row de tipo refund + side-effects. */
  reembolsar(input: ReembolsarInput): Promise<Payment>;

  /** Anula un Payment NO capturado (estado initiated/awaiting_confirmation). */
  anular(input: AnularInput): Promise<Payment>;
}

export const PAYMENT_STRATEGY_REGISTRY = Symbol('PAYMENT_STRATEGY_REGISTRY');

export interface IPaymentStrategyRegistry {
  /** Devuelve la strategy registrada para un método, o lanza si no existe. */
  resolver(method: PaymentMethod): IPaymentStrategy;
}

export const PAYMENT_STATUSES_FINAL: ReadonlySet<PaymentStatus> = new Set([
  'captured', 'failed', 'voided', 'refunded',
]);
