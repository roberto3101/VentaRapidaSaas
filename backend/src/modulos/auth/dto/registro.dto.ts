import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { Rol } from '../../../common/constantes/roles.constant';

export class RegistroDto {
  @IsEmail({}, { message: 'El email no tiene formato válido' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  contrasena: string;

  @IsString()
  @MinLength(2, { message: 'El nombre completo es obligatorio' })
  nombreCompleto: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;

  @IsOptional()
  @IsUUID('4')
  tenantId?: string;
}
