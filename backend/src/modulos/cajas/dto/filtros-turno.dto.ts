import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CashShiftStatus } from '@prisma/client';

export class FiltrosTurnoDto {
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @IsEnum(CashShiftStatus)
  status?: CashShiftStatus;

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
