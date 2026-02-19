import { IsString, IsEmail, MinLength, IsOptional, IsNumber, IsBoolean, IsIn, MaxLength } from 'class-validator';

export class RegistroTenantDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  nombreNegocio: string;

  @IsString()
  @IsIn(['PE', 'VE', 'CO', 'MX', 'CL', 'AR', 'EC', 'BO'])
  codigoPais: string;

  @IsString()
  codigoMoneda: string;

  @IsString()
  simboloMoneda: string;

  @IsOptional()
  @IsString()
  zonaHoraria?: string;

  @IsOptional()
  @IsString()
  nombreImpuesto?: string;

  @IsOptional()
  @IsNumber()
  tasaImpuesto?: number;

  @IsOptional()
  @IsBoolean()
  impuestoIncluido?: boolean;

  @IsString()
  @MinLength(3)
  nombreCompleto: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  contrasena: string;
}
