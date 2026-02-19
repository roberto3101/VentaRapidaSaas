import { IsUUID, IsOptional, IsString, IsArray, ValidateNested, IsInt, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemTransferenciaDto {
  @IsUUID('4') varianteId: string;
  @IsInt() @Min(1) cantidad: number;
}

export class CrearTransferenciaDto {
  @IsUUID('4') sedeOrigenId: string;
  @IsUUID('4') sedeDestinoId: string;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsDateString() fechaEsperada?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemTransferenciaDto)
  items: ItemTransferenciaDto[];
}
