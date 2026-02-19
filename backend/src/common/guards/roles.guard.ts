import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decoradores/roles.decorator';
import { Rol, esRolSuperior } from '../constantes/roles.constant';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rolesRequeridos || rolesRequeridos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user?.rol) {
      throw new ForbiddenException('No tienes un rol asignado');
    }

    const tienePermiso = rolesRequeridos.some(
      (rolRequerido) => esRolSuperior(user.rol as Rol, rolRequerido),
    );

    if (!tienePermiso) {
      throw new ForbiddenException(
        `Se requiere uno de estos roles: ${rolesRequeridos.join(', ')}`,
      );
    }

    return true;
  }
}
