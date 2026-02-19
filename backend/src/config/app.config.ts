import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  puerto: parseInt(process.env.PORT ?? '3000', 10),
  entorno: process.env.NODE_ENV || 'development',
  prefijo: process.env.API_PREFIX || 'api/v1',
  corsOrigenes: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],
  limitePorMinuto: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  ttlSegundos: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
}));
