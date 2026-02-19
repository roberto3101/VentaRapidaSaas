import { Module } from '@nestjs/common';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';
import { VariantesController } from './variantes.controller';
import { VariantesService } from './variantes.service';

@Module({
  controllers: [ProductosController, VariantesController],
  providers: [ProductosService, VariantesService],
  exports: [ProductosService, VariantesService],
})
export class ProductosModule {}
