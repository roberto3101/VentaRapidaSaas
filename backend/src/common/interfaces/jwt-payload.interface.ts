import type { Rol } from '../constantes/roles.constant';

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  email: string;
  rol: Rol;
  sedesIds: string[];
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
}
