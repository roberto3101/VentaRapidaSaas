import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class FiltrosPagoDto {
  @IsOptional()
  @IsUUID('4')
  saleId?: string;

  @IsOptional()
  @IsUUID('4')
  cashShiftId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsISO8601()
  fechaDesde?: string;

  @IsOptional()
  @IsISO8601()
  fechaHasta?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
