import { IsString, IsOptional, MinLength, IsUUID, IsNumber } from 'class-validator';
export class CrearCategoriaDto {
  @IsString() @MinLength(2) nombre: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsUUID('4') categoriaPadreId?: string;
  @IsOptional() @IsNumber() ordenamiento?: number;
}
