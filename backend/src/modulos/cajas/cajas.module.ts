import { Module } from '@nestjs/common';
import { CajasController } from './cajas.controller';
import { CajasService } from './cajas.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CajasController],
  providers: [CajasService],
  exports: [CajasService], // expuesto para ventas (validar turno activo)
})
export class CajasModule {}
