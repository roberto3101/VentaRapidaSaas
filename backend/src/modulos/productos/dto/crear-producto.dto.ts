import { IsString, IsOptional, MinLength, IsBoolean, IsUUID, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CrearVarianteEnProductoDto {
  @IsString() sku: string;
  @IsOptional() @IsString() codigoBarras?: string;
  @IsOptional() @IsString() nombreVariante?: string;
  @IsOptional() @IsNumber() @Min(0) precioCompra?: number;
  @IsOptional() @IsNumber() @Min(0) precioVenta?: number;
  @IsOptional() @IsNumber() @Min(0) stockMinimo?: number;
  @IsOptional() @IsNumber() @Min(0) stockMaximo?: number;
  @IsOptional() @IsString() unidad?: string;
}

export class CrearProductoDto {
  @IsString() @MinLength(2) nombre: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsUUID('4') categoriaId?: string;
  @IsOptional() @IsString() imagenUrl?: string;
  @IsOptional() @IsBoolean() tieneVariantes?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) etiquetas?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrearVarianteEnProductoDto)
  variantes?: CrearVarianteEnProductoDto[];
}
