import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CajasService } from './cajas.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';
import { AprobarDiferenciaDto } from './dto/aprobar-diferencia.dto';
import { FiltrosTurnoDto } from './dto/filtros-turno.dto';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Controller('cajas')
export class CajasController {
  constructor(private readonly cajas: CajasService) {}

  @Post('abrir')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  abrir(@Body() dto: AbrirTurnoDto, @UsuarioActual() usuario: JwtPayload) {
    return this.cajas.abrir(dto, usuario);
  }

  @Get('activo')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  activo(@UsuarioActual() usuario: JwtPayload, @Query('locationId') locationId?: string) {
    return this.cajas.obtenerTurnoActivo(usuario, locationId);
  }

  @Post(':id/cerrar')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  cerrar(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: CerrarTurnoDto,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.cajas.cerrar(id, dto, usuario);
  }

  @Post(':id/movimiento')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  movimiento(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: RegistrarMovimientoDto,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.cajas.registrarMovimiento(id, dto, usuario);
  }

  @Post(':id/aprobar')
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  aprobar(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: AprobarDiferenciaDto,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.cajas.aprobarDiferencia(id, dto, usuario);
  }

  @Get()
  listar(@Query() filtros: FiltrosTurnoDto, @UsuarioActual() usuario: JwtPayload) {
    return this.cajas.listar(filtros, usuario);
  }

  @Get(':id')
  obtenerPorId(@Param('id', ValidarUuidPipe) id: string, @UsuarioActual() usuario: JwtPayload) {
    return this.cajas.obtenerPorId(id, usuario);
  }
}
