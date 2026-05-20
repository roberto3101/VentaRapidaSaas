import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  Max,
  IsPositive,
} from 'class-validator';

export class ItemVentaDto {
  @IsUUID('4', { message: 'variantId debe ser UUID v4' })
  variantId!: string;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'quantity debe ser número' })
  @IsPositive({ message: 'quantity debe ser > 0' })
  @Max(999999, { message: 'quantity excesivo' })
  quantity!: number;

  /**
   * Opcional. Si no se manda, backend obtiene el precio efectivo actual
   * desde catálogo + LocationPrice. Si se manda, backend valida que
   * coincida o esté dentro de tolerancia (anti-tampering).
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPriceHint?: number;

  /**
   * Descuento monetario por línea (no porcentaje). Lo aplica el cajero.
   * Backend valida que no exceda 50% del precio sin tax (regla de negocio).
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  discountAmount?: number;
}

export class CrearVentaDto {
  @IsUUID('4', { message: 'locationId debe ser UUID v4' })
  locationId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'customerId debe ser UUID v4' })
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos 1 item' })
  @ValidateNested({ each: true })
  @Type(() => ItemVentaDto)
  items!: ItemVentaDto[];

  @IsOptional()
  @IsString()
  @Max(500, { message: 'notes muy largo' })
  notes?: string;
}
