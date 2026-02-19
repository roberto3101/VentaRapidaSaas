import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CategoriasService } from './categorias.service';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto';
import { TenantActual } from '../../common/decoradores/tenant-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  @Roles(Rol.TENANT_ADMIN, Rol.LOCATION_MANAGER)
  crear(@TenantActual() tenantId: string, @Body() dto: CrearCategoriaDto) {
    return this.categoriasService.crear(tenantId, dto);
  }

  @Get()
  obtenerTodas(@TenantActual() tenantId: string) {
    return this.categoriasService.obtenerTodas(tenantId);
  }

  @Get('arbol')
  obtenerArbol(@TenantActual() tenantId: string) {
    return this.categoriasService.obtenerArbol(tenantId);
  }

  @Get(':id')
  obtenerPorId(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.categoriasService.obtenerPorId(tenantId, id);
  }

  @Patch(':id')
  @Roles(Rol.TENANT_ADMIN, Rol.LOCATION_MANAGER)
  actualizar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string, @Body() dto: ActualizarCategoriaDto) {
    return this.categoriasService.actualizar(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Rol.TENANT_ADMIN)
  eliminar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.categoriasService.eliminar(tenantId, id);
  }
}
