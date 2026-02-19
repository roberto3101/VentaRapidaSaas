import { IsString, IsOptional, MinLength, IsEmail, IsEnum, IsNumber, Min } from 'class-validator';
export class CrearContactoDto {
  @IsString() @MinLength(2) nombre: string;
  @IsEnum(['supplier', 'customer', 'both']) tipo: string;
  @IsOptional() @IsString() nombreEmpresa?: string;
  @IsOptional() @IsString() tipoDocumento?: string;
  @IsOptional() @IsString() numeroDocumento?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() ciudad?: string;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsNumber() @Min(0) limiteCredito?: number;
  @IsOptional() @IsNumber() @Min(0) diasPlazo?: number;
}
