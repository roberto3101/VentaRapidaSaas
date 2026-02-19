import { IsString, IsOptional, MinLength, IsBoolean, IsNumber, IsEmail } from 'class-validator';

export class CrearSedeDto {
  @IsString() @MinLength(2)
  nombre: string;

  @IsOptional() @IsString()
  codigo?: string;

  @IsOptional() @IsString()
  direccion?: string;

  @IsOptional() @IsString()
  ciudad?: string;

  @IsOptional() @IsString()
  estadoProvincia?: string;

  @IsOptional() @IsString()
  codigoPais?: string;

  @IsOptional() @IsString()
  telefono?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString()
  nombreImpuesto?: string;

  @IsOptional() @IsNumber()
  tasaImpuesto?: number;

  @IsOptional() @IsNumber()
  ordenamiento?: number;
}
