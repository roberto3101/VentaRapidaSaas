import { Controller, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { VariantesService } from './variantes.service';
import { CrearVarianteDto } from './dto/crear-variante.dto';
import { ActualizarVarianteDto } from './dto/actualizar-variante.dto';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('productos/:productoId/variantes')
@Roles(Rol.TENANT_ADMIN, Rol.LOCATION_MANAGER)
export class VariantesController {
  constructor(private readonly variantesService: VariantesService) {}

  @Post()
  crear(@Param('productoId', ValidarUuidPipe) productoId: string, @Body() dto: CrearVarianteDto) {
    return this.variantesService.crear(productoId, dto);
  }

  @Patch(':id')
  actualizar(@Param('id', ValidarUuidPipe) id: string, @Body() dto: ActualizarVarianteDto) {
    return this.variantesService.actualizar(id, dto);
  }

  @Delete(':id')
  eliminar(@Param('id', ValidarUuidPipe) id: string) {
    return this.variantesService.eliminar(id);
  }
}
