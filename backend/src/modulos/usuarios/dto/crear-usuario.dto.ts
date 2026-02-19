import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { Rol } from '../../../common/constantes/roles.constant';

export class CrearUsuarioDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) contrasena: string;
  @IsString() @MinLength(2) nombreCompleto: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsEnum(Rol) rol?: Rol = Rol.OPERATOR;
}
