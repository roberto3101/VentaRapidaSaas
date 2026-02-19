import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ContactosService } from './contactos.service';
import { CrearContactoDto } from './dto/crear-contacto.dto';
import { ActualizarContactoDto } from './dto/actualizar-contacto.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { TenantActual } from '../../common/decoradores/tenant-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('contactos')
export class ContactosController {
  constructor(private readonly contactosService: ContactosService) {}

  @Post()
  @Roles(Rol.TENANT_ADMIN, Rol.LOCATION_MANAGER)
  crear(@TenantActual() tenantId: string, @Body() dto: CrearContactoDto) {
    return this.contactosService.crear(tenantId, dto);
  }

  @Get()
  obtenerTodos(@TenantActual() tenantId: string, @Query() paginacion: PaginacionDto, @Query('tipo') tipo?: string) {
    return this.contactosService.obtenerTodos(tenantId, paginacion, tipo);
  }

  @Get(':id')
  obtenerPorId(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.contactosService.obtenerPorId(tenantId, id);
  }

  @Patch(':id')
  @Roles(Rol.TENANT_ADMIN, Rol.LOCATION_MANAGER)
  actualizar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string, @Body() dto: ActualizarContactoDto) {
    return this.contactosService.actualizar(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Rol.TENANT_ADMIN)
  eliminar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.contactosService.eliminar(tenantId, id);
  }
}
