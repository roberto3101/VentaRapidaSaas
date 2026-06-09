import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const DECIMAL_NO_NEG = /^\d+(\.\d{1,4})?$/;

export class MontoCierreDto {
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currencyCode!: string;

  /** Monto contado físicamente al cierre (string decimal positivo). */
  @IsString()
  @Matches(DECIMAL_NO_NEG, {
    message: 'actualAmount debe ser string decimal positivo (ej. "150.00", máx 4 decimales)',
  })
  actualAmount!: string;
}

export class CerrarTurnoDto {
  /** Montos contados por currency (paralelos a los openingAmounts). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MontoCierreDto)
  actualAmounts!: MontoCierreDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
