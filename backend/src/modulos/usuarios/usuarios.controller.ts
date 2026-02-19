import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { AsignarSedeDto } from './dto/asignar-sede.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { TenantActual } from '../../common/decoradores/tenant-actual.decorator';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('usuarios')
@Roles(Rol.TENANT_ADMIN)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  crear(@TenantActual() tenantId: string, @Body() dto: CrearUsuarioDto, @UsuarioActual('sub') creadoPor: string) {
    return this.usuariosService.crear(tenantId, dto, creadoPor);
  }

  @Get()
  obtenerTodos(@TenantActual() tenantId: string, @Query() paginacion: PaginacionDto) {
    return this.usuariosService.obtenerTodos(tenantId, paginacion);
  }

  @Get(':id')
  obtenerPorId(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.usuariosService.obtenerPorId(tenantId, id);
  }

  @Patch(':id')
  actualizar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string, @Body() dto: ActualizarUsuarioDto) {
    return this.usuariosService.actualizar(tenantId, id, dto);
  }

  @Patch(':id/sedes')
  asignarSedes(
    @TenantActual() tenantId: string,
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: AsignarSedeDto,
    @UsuarioActual('sub') asignadoPor: string,
  ) {
    return this.usuariosService.asignarSedes(tenantId, id, dto, asignadoPor);
  }

  @Delete(':id')
  eliminar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.usuariosService.eliminar(tenantId, id);
  }
}
