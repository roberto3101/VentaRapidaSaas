import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const DECIMAL_POS = /^\d+(\.\d{1,4})?$/;

export class ReembolsarPagoDto {
  @IsString()
  @Matches(DECIMAL_POS, { message: 'amount debe ser decimal positivo' })
  amount!: string;

  @IsString()
  @MinLength(3, { message: 'Motivo del reembolso obligatorio (mín 3 chars)' })
  @MaxLength(500)
  motivo!: string;

  /** Turno activo del refund'er (override; si no, se resuelve por user). */
  @IsOptional()
  @IsUUID('4')
  cashShiftId?: string;
}
