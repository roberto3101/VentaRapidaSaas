import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export const UsuarioActual = createParamDecorator(
  (campo: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const usuario = request.user as JwtPayload;
    return campo ? usuario?.[campo] : usuario;
  },
);
