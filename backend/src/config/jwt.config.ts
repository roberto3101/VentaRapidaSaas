import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secreto: process.env.JWT_SECRET || 'cambiar-en-produccion',
  expiracion: process.env.JWT_EXPIRATION || '15m',
  secretoRefresh: process.env.JWT_REFRESH_SECRET || 'cambiar-refresh-en-produccion',
  expiracionRefresh: process.env.JWT_REFRESH_EXPIRATION || '7d',
}));
