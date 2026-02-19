import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
export class CrearVarianteDto {
  @IsString() sku: string;
  @IsOptional() @IsString() codigoBarras?: string;
  @IsOptional() @IsString() nombreVariante?: string;
  @IsOptional() @IsNumber() @Min(0) precioCompra?: number;
  @IsOptional() @IsNumber() @Min(0) precioVenta?: number;
  @IsOptional() @IsNumber() @Min(0) stockMinimo?: number;
  @IsOptional() @IsNumber() @Min(0) stockMaximo?: number;
  @IsOptional() @IsString() unidad?: string;
  @IsOptional() @IsNumber() unidadesPorCaja?: number;
}
