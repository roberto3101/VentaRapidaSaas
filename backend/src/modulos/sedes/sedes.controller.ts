import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { SedesService } from './sedes.service';
import { CrearSedeDto } from './dto/crear-sede.dto';
import { ActualizarSedeDto } from './dto/actualizar-sede.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { TenantActual } from '../../common/decoradores/tenant-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('sedes')
export class SedesController {
  constructor(private readonly sedesService: SedesService) {}

  @Post()
  @Roles(Rol.TENANT_ADMIN)
  crear(@TenantActual() tenantId: string, @Body() dto: CrearSedeDto) {
    return this.sedesService.crear(tenantId, dto);
  }

  @Get()
  obtenerTodas(@TenantActual() tenantId: string, @Query() paginacion: PaginacionDto) {
    return this.sedesService.obtenerTodas(tenantId, paginacion);
  }

  @Get('resumen')
  obtenerResumen(@TenantActual() tenantId: string) {
    return this.sedesService.obtenerResumen(tenantId);
  }

  @Get(':id')
  obtenerPorId(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.sedesService.obtenerPorId(tenantId, id);
  }

  @Patch(':id')
  @Roles(Rol.TENANT_ADMIN)
  actualizar(
    @TenantActual() tenantId: string,
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: ActualizarSedeDto,
  ) {
    return this.sedesService.actualizar(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Rol.TENANT_ADMIN)
  eliminar(@TenantActual() tenantId: string, @Param('id', ValidarUuidPipe) id: string) {
    return this.sedesService.eliminar(tenantId, id);
  }
}
