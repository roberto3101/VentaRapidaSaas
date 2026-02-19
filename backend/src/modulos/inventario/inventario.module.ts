import { Module } from '@nestjs/common';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { EscanerController } from './escaner.controller';
import { EscanerService } from './escaner.service';

@Module({
  controllers: [InventarioController, EscanerController],
  providers: [InventarioService, EscanerService],
  exports: [InventarioService],
})
export class InventarioModule {}
