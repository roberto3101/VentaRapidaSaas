import { Logger } from '@nestjs/common';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { esOrigenPermitido } from '../seguridad/cors-origenes.util';

/**
 * Defensa en profundidad para CORS (SIS-25).
 *
 * El CORS de Express ya bloquea la respuesta vía el ACAO header, pero un
 * navegador hostil o un cliente que ignore las reglas CORS podría enviar
 * cookies/JWT junto con un Origin no autorizado. Este middleware corta el
 * request antes de llegar al controller cuando:
 *  - El header `Origin` viene presente, Y
 *  - No coincide con la allowlist.
 *
 * Requests sin header `Origin` (curl, mobile native, server-to-server) pasan
 * — el control de acceso ahí es responsabilidad del JWT guard.
 */
export function crearOrigenPermitidoMiddleware(
  permitidos: ReadonlySet<string>,
): RequestHandler {
  const logger = new Logger('OrigenPermitidoMiddleware');

  return (req: Request, res: Response, next: NextFunction): void => {
    const origen = req.header('origin');
    if (!origen) {
      next();
      return;
    }

    if (!esOrigenPermitido(origen, permitidos)) {
      logger.warn(
        `Origen rechazado: ${origen} ${req.method} ${req.originalUrl}`,
      );
      res
        .status(403)
        .json({
          statusCode: 403,
          message: 'Origen no permitido.',
          error: 'Forbidden',
        });
      return;
    }

    next();
  };
}
