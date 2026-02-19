import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { DatabaseService } from '../../database/database.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditoriaInterceptor.name);

  constructor(private readonly db: DatabaseService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const metodo = request.method;
    const url = request.url;
    const usuario = request.user;
    const inicio = Date.now();

    return next.handle().pipe(
      tap({
        next: (datos) => {
          const duracion = Date.now() - inicio;
          if (duracion > 1000) {
            this.logger.warn(`Solicitud lenta: ${metodo} ${url} (${duracion}ms)`);
          }
        },
        error: (error) => {
          this.logger.error(`Error en ${metodo} ${url}: ${error.message}`);
        },
      }),
    );
  }

  async registrarAuditoria(params: {
    tenantId?: string;
    userId?: string;
    accion: AuditAction;
    tipoEntidad: string;
    entidadId?: string;
    valoresAnteriores?: any;
    valoresNuevos?: any;
    ip?: string;
    userAgent?: string;
  }) {
    try {
      await this.db.auditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          action: params.accion,
          entityType: params.tipoEntidad,
          entityId: params.entidadId,
          oldValues: params.valoresAnteriores,
          newValues: params.valoresNuevos,
          ipAddress: params.ip,
          userAgent: params.userAgent,
        },
      });
    } catch (error) {
      this.logger.error(`Error al registrar auditoría: ${error.message}`);
    }
  }
}
