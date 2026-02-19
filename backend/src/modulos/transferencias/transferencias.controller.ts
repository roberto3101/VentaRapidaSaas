import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { TransferenciasService } from './transferencias.service';
import { CrearTransferenciaDto } from './dto/crear-transferencia.dto';
import { CancelarTransferenciaDto } from './dto/cancelar-transferencia.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { TenantActual } from '../../common/decoradores/tenant-actual.decorator';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('transferencias')
export class TransferenciasController {
  constructor(private readonly transferenciasService: TransferenciasService) {}

  @Post()
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  crear(@Body() dto: CrearTransferenciaDto, @UsuarioActual() usuario: any) {
    return this.transferenciasService.crear(dto, usuario);
  }

  @Get()
  obtenerTodas(@TenantActual() tenantId: string, @Query() paginacion: PaginacionDto) {
    return this.transferenciasService.obtenerTodas(tenantId, paginacion);
  }

  @Get(':id')
  obtenerPorId(@Param('id', ValidarUuidPipe) id: string) {
    return this.transferenciasService.obtenerPorId(id);
  }

  @Patch(':id/despachar')
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  despachar(@Param('id', ValidarUuidPipe) id: string, @UsuarioActual() usuario: any) {
    return this.transferenciasService.despachar(id, usuario);
  }

  @Patch(':id/recibir')
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  recibir(@Param('id', ValidarUuidPipe) id: string, @UsuarioActual() usuario: any) {
    return this.transferenciasService.recibir(id, usuario);
  }

  @Patch(':id/cancelar')
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  cancelar(@Param('id', ValidarUuidPipe) id: string, @Body() dto: CancelarTransferenciaDto, @UsuarioActual() usuario: any) {
    return this.transferenciasService.cancelar(id, dto, usuario);
  }
}
