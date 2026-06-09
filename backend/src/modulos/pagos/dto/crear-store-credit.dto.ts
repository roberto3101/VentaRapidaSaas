import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const DECIMAL_POS = /^\d+(\.\d{1,4})?$/;

export class CrearStoreCreditDto {
  @IsString()
  @Matches(DECIMAL_POS, { message: 'amount debe ser decimal positivo' })
  amount!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currencyCode!: string;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  /** NULL = usable en cualquier sede del tenant. */
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
