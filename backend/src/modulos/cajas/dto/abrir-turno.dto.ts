import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Decimal positivo string-form, hasta 4 decimales. Sin signo (ADR-004 §Decimal-as-string). */
const DECIMAL_NO_NEG = /^\d+(\.\d{1,4})?$/;

export class MontoAperturaDto {
  /** Código de moneda ISO 4217 (ej. PEN, USD, VES). */
  @IsString()
  @Length(3, 3, { message: 'currencyCode debe ser ISO 4217 de 3 letras' })
  @Matches(/^[A-Z]{3}$/, { message: 'currencyCode debe ser 3 letras mayúsculas' })
  currencyCode!: string;

  /**
   * Monto de apertura como string decimal positivo (ej. "150.00", "0", "0.50").
   * Decimal-as-string para evitar pérdida de precisión float ([[004-money-and-currency]]).
   */
  @IsString()
  @Matches(DECIMAL_NO_NEG, {
    message: 'openingAmount debe ser string decimal positivo (ej. "150.00", máx 4 decimales)',
  })
  openingAmount!: string;
}

export class AbrirTurnoDto {
  @IsUUID('4', { message: 'locationId debe ser UUID v4' })
  locationId!: string;

  /**
   * Montos de apertura por moneda. Para PE típicamente 1 entrada (PEN).
   * Para VE bimonetario ([[022-bimonetary-venezuela]]) puede ser [{VES}, {USD}].
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe declarar al menos 1 moneda de apertura' })
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MontoAperturaDto)
  openingAmounts!: MontoAperturaDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
