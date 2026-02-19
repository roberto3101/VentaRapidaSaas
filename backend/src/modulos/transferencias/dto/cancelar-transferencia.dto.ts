import { IsString, MinLength } from 'class-validator';
export class CancelarTransferenciaDto {
  @IsString() @MinLength(5) razon: string;
}
