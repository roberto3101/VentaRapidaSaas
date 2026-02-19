import { IsUUID, IsEnum, IsInt, Min, IsOptional, IsString, IsNumber } from 'class-validator';
import { TipoMovimiento } from '../../../common/constantes/tipos-movimiento.constant';

export class CrearMovimientoDto {
  @IsUUID('4') varianteId: string;
  @IsUUID('4') sedeId: string;
  @IsEnum(TipoMovimiento) tipoMovimiento: TipoMovimiento;
  @IsInt() @Min(1) cantidad: number;
  @IsOptional() @IsUUID('4') contactoId?: string;
  @IsOptional() @IsUUID('4') transferenciaId?: string;
  @IsOptional() @IsString() codigoReferencia?: string;
  @IsOptional() @IsNumber() @Min(0) precioUnitario?: number;
  @IsOptional() @IsString() notas?: string;
}
