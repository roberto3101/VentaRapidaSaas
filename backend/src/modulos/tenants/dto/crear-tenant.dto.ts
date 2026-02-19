import { IsString, IsOptional, MinLength, IsBoolean, IsNumber, Min, Max, IsIn } from 'class-validator';

export class CrearTenantDto {
  @IsString()
  @MinLength(2)
  nombre: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PE', 'VE', 'CO', 'MX', 'CL', 'EC'])
  codigoPais?: string = 'PE';

  @IsOptional()
  @IsString()
  codigoMoneda?: string = 'PEN';

  @IsOptional()
  @IsString()
  simboloMoneda?: string = 'S/';

  @IsOptional()
  @IsString()
  zonaHoraria?: string = 'America/Lima';

  @IsOptional()
  @IsString()
  nombreImpuesto?: string = 'IGV';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tasaImpuesto?: number = 18;

  @IsOptional()
  @IsBoolean()
  impuestoIncluido?: boolean = true;

  @IsOptional()
  @IsBoolean()
  permitirStockNegativo?: boolean = false;
}
