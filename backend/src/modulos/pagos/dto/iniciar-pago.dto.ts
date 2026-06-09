import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

const DECIMAL_POS = /^\d+(\.\d{1,4})?$/;

export class IniciarPagoDto {
  @IsEnum(PaymentMethod, { message: 'method inválido' })
  method!: PaymentMethod;

  @IsString()
  @Matches(DECIMAL_POS, { message: 'amount debe ser decimal positivo (ej. "10.50")' })
  amount!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currencyCode debe ser ISO 4217 (3 letras mayúsculas)' })
  currencyCode!: string;

  @IsOptional()
  @IsUUID('4', { message: 'saleId debe ser UUID v4' })
  saleId?: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsUUID('4')
  cashShiftId?: string;

  @IsOptional()
  @IsUUID('4')
  storeCreditId?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_POS, { message: 'receivedAmount debe ser decimal positivo' })
  receivedAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  /** Idempotency-Key del frontend para evitar doble-clic / reintentos. */
  @IsOptional()
  @IsString()
  @Length(8, 64)
  idempotencyKey?: string;
}
