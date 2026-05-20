import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelarVentaDto {
  @IsString()
  @MinLength(3, { message: 'Motivo de cancelación obligatorio (min 3 chars)' })
  @MaxLength(500)
  motivo!: string;
}
