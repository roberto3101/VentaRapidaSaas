import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnularPagoDto {
  @IsString()
  @MinLength(3, { message: 'Motivo de anulación obligatorio (mín 3 chars)' })
  @MaxLength(500)
  motivo!: string;
}
