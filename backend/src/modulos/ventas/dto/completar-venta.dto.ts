import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsPositive,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class PagoDto {
  @IsEnum(PaymentMethod, { message: 'method inválido' })
  method!: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive({ message: 'amount debe ser > 0' })
  amount!: number;

  /**
   * Solo para method=cash: monto efectivo recibido (para calcular vuelto).
   * Si receivedAmount > amount, la diferencia es el vuelto y se calcula automático.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  receivedAmount?: number;

  /**
   * Identificador del pago: últimos 4 dígitos tarjeta, código yape, etc.
   * Free text validado para prevenir XSS.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;
}

export class CompletarVentaDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Al menos 1 pago requerido' })
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  payments!: PagoDto[];
}
