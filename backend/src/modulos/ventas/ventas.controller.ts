import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { CrearVentaDto } from './dto/crear-venta.dto';
import { CompletarVentaDto } from './dto/completar-venta.dto';
import { CancelarVentaDto } from './dto/cancelar-venta.dto';
import { FiltrosVentaDto } from './dto/filtros-venta.dto';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  @Post()
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  crear(@Body() dto: CrearVentaDto, @UsuarioActual() usuario: JwtPayload) {
    return this.ventas.crear(dto, usuario);
  }

  @Post(':id/completar')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  completar(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: CompletarVentaDto,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.ventas.completar(id, dto, usuario);
  }

  @Post(':id/cancelar')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  cancelar(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: CancelarVentaDto,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.ventas.cancelar(id, dto, usuario);
  }

  @Get()
  listar(@Query() filtros: FiltrosVentaDto, @UsuarioActual() usuario: JwtPayload) {
    return this.ventas.listar(filtros, usuario);
  }

  @Get(':id')
  obtenerPorId(@Param('id', ValidarUuidPipe) id: string, @UsuarioActual() usuario: JwtPayload) {
    return this.ventas.obtenerPorId(id, usuario);
  }
}
