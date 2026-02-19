import { IsString, MinLength } from 'class-validator';
export class ReversionDto {
  @IsString() @MinLength(5, { message: 'La razón de reversión debe tener al menos 5 caracteres' })
  razon: string;
}
