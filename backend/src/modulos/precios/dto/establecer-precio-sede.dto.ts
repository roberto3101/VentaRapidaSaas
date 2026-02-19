import { IsUUID, IsEnum, IsNumber, Min } from 'class-validator';
export class EstablecerPrecioSedeDto {
  @IsUUID('4') varianteId: string;
  @IsUUID('4') sedeId: string;
  @IsEnum(['sale', 'purchase']) tipoPrecio: string;
  @IsNumber() @Min(0) precio: number;
}
