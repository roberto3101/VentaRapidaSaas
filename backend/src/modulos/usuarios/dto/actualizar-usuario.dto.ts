import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Rol } from '../../../common/constantes/roles.constant';

export class ActualizarUsuarioDto {
  @IsOptional() @IsString() nombreCompleto?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsEnum(Rol) rol?: Rol;
  @IsOptional() @IsBoolean() activo?: boolean;
}
