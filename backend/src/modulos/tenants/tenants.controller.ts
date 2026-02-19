import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CrearTenantDto } from './dto/crear-tenant.dto';
import { ActualizarTenantDto } from './dto/actualizar-tenant.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('tenants')
@Roles(Rol.SUPER_ADMIN)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  crear(@Body() dto: CrearTenantDto) {
    return this.tenantsService.crear(dto);
  }

  @Get()
  obtenerTodos(@Query() paginacion: PaginacionDto) {
    return this.tenantsService.obtenerTodos(paginacion);
  }

  @Get(':id')
  obtenerPorId(@Param('id', ValidarUuidPipe) id: string) {
    return this.tenantsService.obtenerPorId(id);
  }

  @Patch(':id')
  actualizar(@Param('id', ValidarUuidPipe) id: string, @Body() dto: ActualizarTenantDto) {
    return this.tenantsService.actualizar(id, dto);
  }

  @Delete(':id')
  eliminar(@Param('id', ValidarUuidPipe) id: string) {
    return this.tenantsService.eliminar(id);
  }
}
