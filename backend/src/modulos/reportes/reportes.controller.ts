import { Controller, Get, Post, Query } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { TenantActual } from '../../common/decoradores/tenant-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';

@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('dashboard')
  obtenerDashboard(@TenantActual() tenantId: string, @Query('sedeId') sedeId?: string) {
    return this.reportesService.obtenerResumenDashboard(tenantId, sedeId);
  }

  @Get('movimientos-por-tipo')
  movimientosPorTipo(
    @TenantActual() tenantId: string,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.reportesService.obtenerMovimientosPorTipo(tenantId, fechaInicio, fechaFin, sedeId);
  }

  @Get('top-productos')
  topProductos(@TenantActual() tenantId: string, @Query('sedeId') sedeId?: string, @Query('limite') limite?: number) {
    return this.reportesService.obtenerTopProductos(tenantId, sedeId, limite);
  }

  @Get('movimientos-diarios')
  movimientosDiarios(@TenantActual() tenantId: string, @Query('dias') dias?: number, @Query('sedeId') sedeId?: string) {
    return this.reportesService.obtenerMovimientosDiarios(tenantId, dias, sedeId);
  }

  @Get('integridad-stock')
  @Roles(Rol.SUPER_ADMIN, Rol.TENANT_ADMIN)
  verificarIntegridad() {
    return this.reportesService.verificarIntegridadStock();
  }

  @Post('recalcular-stock')
  @Roles(Rol.SUPER_ADMIN)
  recalcularStock() {
    return this.reportesService.recalcularStock();
  }
}
