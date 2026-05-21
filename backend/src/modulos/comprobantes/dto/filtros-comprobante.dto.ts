import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ReceiptStatus, ReceiptType } from '@prisma/client';

export class FiltrosComprobanteDto {
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsEnum(ReceiptType)
  type?: ReceiptType;

  @IsOptional()
  @IsEnum(ReceiptStatus)
  status?: ReceiptStatus;

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
