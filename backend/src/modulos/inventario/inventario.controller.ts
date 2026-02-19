import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto';
import { ReversionDto } from './dto/reversion.dto';
import { ConsultaStockDto } from './dto/consulta-stock.dto';
import { TenantActual } from '../../common/decoradores/tenant-actual.decorator';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';

@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Post('movimientos')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  crearMovimiento(@Body() dto: CrearMovimientoDto, @UsuarioActual() usuario: any) {
    return this.inventarioService.crearMovimiento(dto, usuario);
  }

  @Post('movimientos/:id/revertir')
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  revertirMovimiento(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: ReversionDto,
    @UsuarioActual() usuario: any,
  ) {
    return this.inventarioService.revertirMovimiento(id, dto.razon, usuario);
  }

  @Get('stock')
  obtenerStock(@TenantActual() tenantId: string, @Query() filtros: ConsultaStockDto) {
    return this.inventarioService.obtenerStock(tenantId, filtros);
  }

  @Get('stock/:varianteId/:sedeId')
  obtenerStockEspecifico(
    @Param('varianteId', ValidarUuidPipe) varianteId: string,
    @Param('sedeId', ValidarUuidPipe) sedeId: string,
  ) {
    return this.inventarioService.obtenerStockPorVarianteYSede(varianteId, sedeId);
  }

  @Get('movimientos')
  obtenerMovimientos(
    @TenantActual() tenantId: string,
    @Query('sedeId') sedeId?: string,
    @Query('tipo') tipo?: string,
    @Query('limite') limite?: number,
    @Query('offset') offset?: number,
  ) {
    return this.inventarioService.obtenerMovimientos(tenantId, { sedeId, tipo, limite, offset });
  }
}
