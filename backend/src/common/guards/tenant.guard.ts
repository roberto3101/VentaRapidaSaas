import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '../constantes/roles.constant';
import { ES_PUBLICO_KEY } from '../decoradores/publico.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (esPublico) return true;

    const request = context.switchToHttp().getRequest();
    const usuario = request.user;

    if (usuario?.rol === Rol.SUPER_ADMIN) return true;

    if (!usuario?.tenantId) {
      throw new ForbiddenException('No tienes un tenant asignado');
    }

    return true;
  }
}