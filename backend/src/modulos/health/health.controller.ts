import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Publico } from '../../common/decoradores/publico.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Publico()
  @Get()
  async verificarSalud() {
    const inicio = Date.now();
    try {
      await this.db.$queryRaw`SELECT 1`;
      return {
        estado: 'saludable',
        baseDatos: 'conectada',
        latenciaMs: Date.now() - inicio,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        entorno: process.env.NODE_ENV || 'development',
      };
    } catch (error) {
      return {
        estado: 'degradado',
        baseDatos: 'desconectada',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
