import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface RespuestaApi<T> {
  exitoso: boolean;
  datos: T;
  meta?: {
    total?: number;
    pagina?: number;
    limite?: number;
    totalPaginas?: number;
  };
  timestamp: string;
}

@Injectable()
export class TransformarInterceptor<T> implements NestInterceptor<T, RespuestaApi<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<RespuestaApi<T>> {
    return next.handle().pipe(
      map((datos) => {
        // Si ya tiene formato paginado, preservar meta
        if (datos?.datos && datos?.meta) {
          return {
            exitoso: true,
            datos: datos.datos,
            meta: datos.meta,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          exitoso: true,
          datos,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
