import { IsOptional, IsString } from 'class-validator';
export class RecibirTransferenciaDto {
  @IsOptional() @IsString() notas?: string;
}
