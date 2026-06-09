import { Module } from '@nestjs/common';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { DatabaseModule } from '../../database/database.module';
import { CashPaymentStrategy } from './strategies/cash-payment.strategy';
import { StoreCreditPaymentStrategy } from './strategies/store-credit-payment.strategy';
import { PaymentStrategyRegistry } from './strategies/payment-strategy.registry';

@Module({
  imports: [DatabaseModule],
  controllers: [PagosController],
  providers: [
    PagosService,
    CashPaymentStrategy,
    StoreCreditPaymentStrategy,
    PaymentStrategyRegistry,
  ],
  exports: [PagosService, PaymentStrategyRegistry],
})
export class PagosModule {}
