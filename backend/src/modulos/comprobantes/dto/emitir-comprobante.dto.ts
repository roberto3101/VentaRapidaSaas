import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ReceiptType } from '@prisma/client';

export class EmitirComprobanteDto {
  @IsUUID('4', { message: 'saleId debe ser UUID v4' })
  saleId!: string;

  @IsEnum(ReceiptType, { message: 'type debe ser ticket|boleta|factura|nota_credito|nota_debito' })
  type!: ReceiptType;

  /**
   * Serie del comprobante (ej. "T001", "B001", "F001").
   * Si no se manda, se usa serie default por tipo configurada en el tenant.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/, { message: 'series formato inválido (alfanumérico mayúsculas 2-10)' })
  series?: string;

  /**
   * Datos del cliente (snapshot). Opcional para ticket interno.
   * Obligatorio para boleta/factura con cliente identificado.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerDocType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerDocNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;
}
