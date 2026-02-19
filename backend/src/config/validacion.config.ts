import { ValidationPipeOptions } from '@nestjs/common';

export const OPCIONES_VALIDACION: ValidationPipeOptions = {
  whitelist: true,          // Solo propiedades del DTO
  forbidNonWhitelisted: true, // Error si envían campos extra
  transform: true,          // Auto-transformar tipos
  transformOptions: {
    enableImplicitConversion: true,
  },
};
