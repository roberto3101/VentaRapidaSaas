import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnularComprobanteDto {
  @IsString()
  @MinLength(3, { message: 'Motivo de anulación obligatorio (min 3 chars)' })
  @MaxLength(500)
  motivo!: string;
}
