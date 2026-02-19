import { IsString, IsUUID } from 'class-validator';
export class EscanearCodigoDto {
  @IsString() codigoBarras: string;
  @IsUUID('4') sedeId: string;
}
