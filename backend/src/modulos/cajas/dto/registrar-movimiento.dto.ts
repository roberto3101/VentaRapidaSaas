import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { CashMovementReason, CashMovementType } from '@prisma/client';

const DECIMAL_NO_NEG = /^\d+(\.\d{1,4})?$/;

export class RegistrarMovimientoDto {
  @IsEnum(CashMovementType, { message: 'type debe ser in|out' })
  type!: CashMovementType;

  /**
   * Razón del movimiento. NO se permite `initial`, `sale`, `refund` ni `closing` (se generan por el sistema).
   * Solo `cash_in`, `cash_out`, `adjustment` son manuales.
   */
  @IsEnum(CashMovementReason, { message: 'reason inválida' })
  reason!: CashMovementReason;

  @IsString()
  @Matches(DECIMAL_NO_NEG, {
    message: 'amount debe ser string decimal positivo (ej. "10.50", máx 4 decimales)',
  })
  amount!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currencyCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
