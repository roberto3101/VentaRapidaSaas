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

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const puerto = config.get<number>('app.puerto', 3000);
  const prefijo = config.get<string>('app.prefijo', 'api/v1');
  const corsOrigenes = config.get<string[]>('app.corsOrigenes', ['http://localhost:3001']);

  // Prefijo global de API
  app.setGlobalPrefix(prefijo);

  // CORS
  app.enableCors({
    origin: corsOrigenes,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
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
  logger.log(`🌍 Entorno: ${config.get('app.entorno')}`);
}

bootstrap();