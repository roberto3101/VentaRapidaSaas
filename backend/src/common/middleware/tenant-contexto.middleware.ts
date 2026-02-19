import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class TenantContextoMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextoMiddleware.name);

  constructor(private readonly db: DatabaseService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const usuario = (req as any).user;

    if (usuario?.tenantId) {
      try {
        await this.db.establecerTenantActual(usuario.tenantId);
      } catch (error) {
        this.logger.error(`Error al establecer tenant ${usuario.tenantId}: ${error.message}`);
      }
    }

    next();
  }
}
