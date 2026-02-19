import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { TenantActual } from '../../common/decoradores/tenant-actual.decorator';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Post()
  @Roles(Rol.TENANT_ADMIN, Rol.LOCATION_MANAGER)
  crear(@TenantActual() tenantId: string, @Body() dto: CrearProductoDto, @UsuarioActual('sub') userId: string) {
    return this.productosService.crear(tenantId, dto, userId);
  }

  @Get()
  obtenerTodos(@TenantActual() tenantId: string, @Query() paginacion: PaginacionDto) {
    return this.productosService.obtenerTodos(tenantId, paginacion);
  }

  @Get('buscar-codigo/:codigo')
  buscarPorCodigo(@TenantActual() tenantId: string, @Param('codigo') codigo: string) {
    return this.productosService.buscarPorCodigoBarras(tenantId, codigo);
  }

  @Get(':id')
  obtenerPorId(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.productosService.obtenerPorId(tenantId, id);
  }

  @Patch(':id')
  @Roles(Rol.TENANT_ADMIN, Rol.LOCATION_MANAGER)
  actualizar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string, @Body() dto: ActualizarProductoDto, @UsuarioActual('sub') userId: string) {
    return this.productosService.actualizar(tenantId, id, dto, userId);
  }

  @Delete(':id')
  @Roles(Rol.TENANT_ADMIN)
  eliminar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.productosService.eliminar(tenantId, id);
  }
}
