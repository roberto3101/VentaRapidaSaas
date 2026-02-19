import { IsUUID, IsEnum, IsNumber, Min, IsDateString, IsOptional } from 'class-validator';
export class EstablecerPromoDto {
  @IsUUID('4') varianteId: string;
  @IsUUID('4') sedeId: string;
  @IsEnum(['sale', 'purchase']) tipoPrecio: string;
  @IsNumber() @Min(0) precioPromo: number;
  @IsDateString() fechaInicio: string;
  @IsOptional() @IsDateString() fechaFin?: string;
}
