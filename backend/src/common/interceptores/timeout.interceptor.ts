import { Injectable, NestInterceptor, ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly tiempoLimiteMs: number;

  constructor(tiempoLimiteMs: number = 30000) {
    this.tiempoLimiteMs = tiempoLimiteMs;
  }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.tiempoLimiteMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException('La solicitud ha excedido el tiempo límite'));
        }
        return throwError(() => err);
      }),
    );
  }
}
