// Fix BigInt serialization
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ExcepcionHttpFilter } from './common/filtros/excepcion-http.filter';
import { TransformarInterceptor } from './common/interceptores/transformar.interceptor';
import { TimeoutInterceptor } from './common/interceptores/timeout.interceptor';
import { OPCIONES_VALIDACION } from './config/validacion.config';
import { normalizarOrigenes } from './common/seguridad/cors-origenes.util';
import { crearOrigenPermitidoMiddleware } from './common/middleware/origen-permitido.middleware';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const puerto = config.get<number>('app.puerto', 3000);
  const prefijo = config.get<string>('app.prefijo', 'api/v1');
  const entorno = config.get<string>('app.entorno', 'development');
  const corsOrigenesCrudos = config.get<string[]>('app.corsOrigenes', []);

  // SIS-25: validar y normalizar la allowlist al boot.
  // Falla rápido si la config es insegura (wildcard, http en prod, etc.).
  const { lista: origenesPermitidos, permitidos } = normalizarOrigenes(
    corsOrigenesCrudos,
    entorno,
  );

  // Prefijo global de API
  app.setGlobalPrefix(prefijo);

  // SIS-25 defensa en profundidad: rechaza Origin no permitido antes del controller.
  app.use(crearOrigenPermitidoMiddleware(origenesPermitidos));

  // CORS — allowlist estricta (SIS-25). NUNCA `origin: true` con `credentials: true`.
  app.enableCors({
    origin: (origen, callback) => {
      if (!origen) {
        // Sin header Origin → request same-origin o no-browser. Permitido.
        callback(null, true);
        return;
      }
      if (origenesPermitidos.has(origen)) {
        callback(null, true);
        return;
      }
      // No allowlisted → CORS lib NO emite ACAO. Pasamos `false`, no Error,
      // para no propagar excepciones ruidosas en logs por scans automáticos.
      callback(null, false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    maxAge: 600,
  });

  // Pipes globales (validación de DTOs)
  app.useGlobalPipes(new ValidationPipe(OPCIONES_VALIDACION));

  // Filtros globales (manejo de errores)
  app.useGlobalFilters(new ExcepcionHttpFilter());

  // Interceptores globales
  app.useGlobalInterceptors(
    new TransformarInterceptor(),
    new TimeoutInterceptor(30000),
  );

  await app.listen(puerto);

  logger.log(`🚀 Servidor corriendo en http://localhost:${puerto}/${prefijo}`);
  logger.log(`📊 Health check: http://localhost:${puerto}/${prefijo}/health`);
  logger.log(`🌍 Entorno: ${entorno}`);
  logger.log(
    permitidos.length > 0
      ? `🛡️  CORS allowlist: ${permitidos.join(', ')}`
      : '🛡️  CORS allowlist vacía (solo same-origin)',
  );
}

bootstrap();