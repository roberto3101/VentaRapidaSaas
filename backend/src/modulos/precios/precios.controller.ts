import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { PreciosService } from './precios.service';
import { EstablecerPrecioSedeDto } from './dto/establecer-precio-sede.dto';
import { EstablecerPromoDto } from './dto/establecer-promo.dto';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('precios')
@Roles(Rol.TENANT_ADMIN, Rol.LOCATION_MANAGER)
export class PreciosController {
  constructor(private readonly preciosService: PreciosService) {}

  @Post('sede')
  establecerPrecio(@Body() dto: EstablecerPrecioSedeDto, @UsuarioActual('sub') userId: string) {
    return this.preciosService.establecerPrecioSede(dto, userId);
  }

  @Post('promo')
  establecerPromo(@Body() dto: EstablecerPromoDto, @UsuarioActual('sub') userId: string) {
    return this.preciosService.establecerPromo(dto, userId);
  }

  @Get('efectivo/:varianteId/:sedeId')
  obtenerPrecioEfectivo(
    @Param('varianteId', ValidarUuidPipe) varianteId: string,
    @Param('sedeId', ValidarUuidPipe) sedeId: string,
    @Query('tipo') tipo?: 'sale' | 'purchase',
  ) {
    return this.preciosService.obtenerPrecioEfectivo(varianteId, sedeId, tipo);
  }

  @Get('sede/:sedeId')
  obtenerPorSede(@Param('sedeId', ValidarUuidPipe) sedeId: string) {
    return this.preciosService.obtenerPreciosPorSede(sedeId);
  }

  @Delete(':id')
  eliminar(@Param('id', ValidarUuidPipe) id: string) {
    return this.preciosService.eliminarPrecioSede(id);
  }
}
