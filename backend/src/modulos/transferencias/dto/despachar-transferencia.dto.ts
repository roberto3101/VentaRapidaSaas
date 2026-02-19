import { IsOptional, IsString } from 'class-validator';
export class DespacharTransferenciaDto {
  @IsOptional() @IsString() notas?: string;
}
