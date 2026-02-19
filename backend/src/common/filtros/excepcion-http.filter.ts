import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ExcepcionHttpFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExcepcionHttpFilter.name);

  catch(excepcion: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let estado: number;
    let mensaje: string | object;

    if (excepcion instanceof HttpException) {
      estado = excepcion.getStatus();
      const respuesta = excepcion.getResponse();
      mensaje = typeof respuesta === 'string' ? respuesta : respuesta;
    } else {
      estado = HttpStatus.INTERNAL_SERVER_ERROR;
      mensaje = 'Error interno del servidor';
      this.logger.error(
        `Error no manejado: ${excepcion}`,
        excepcion instanceof Error ? excepcion.stack : undefined,
      );
    }

    const cuerpoRespuesta = {
      exitoso: false,
      codigoEstado: estado,
      mensaje: typeof mensaje === 'object' ? (mensaje as any).message || mensaje : mensaje,
      timestamp: new Date().toISOString(),
      ruta: request.url,
    };

    response.status(estado).json(cuerpoRespuesta);
  }
}
