import { Injectable, NotImplementedException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { IPaymentStrategy, IPaymentStrategyRegistry } from './payment-strategy.interface';
import { CashPaymentStrategy } from './cash-payment.strategy';
import { StoreCreditPaymentStrategy } from './store-credit-payment.strategy';

/**
 * Registro central de strategies. Cuando llegue Yape/Niubiz/Plin, se inyectan aquí.
 * Ningún otro módulo importa strategies directamente — siempre via este registry.
 */
@Injectable()
export class PaymentStrategyRegistry implements IPaymentStrategyRegistry {
  private readonly map: Map<PaymentMethod, IPaymentStrategy>;

  constructor(
    private readonly cash: CashPaymentStrategy,
    private readonly storeCredit: StoreCreditPaymentStrategy,
  ) {
    this.map = new Map<PaymentMethod, IPaymentStrategy>([
      [cash.method, cash],
      [storeCredit.method, storeCredit],
      // TODO ADR-018: agregar yape, plin, card_debit, card_credit, bank_transfer
      //   cuando entren con credenciales reales.
    ]);
  }

  resolver(method: PaymentMethod): IPaymentStrategy {
    const s = this.map.get(method);
    if (!s) {
      throw new NotImplementedException(
        `Método de pago ${method} no implementado en MVP. Disponibles: ${[...this.map.keys()].join(', ')}`,
      );
    }
    return s;
  }
}
