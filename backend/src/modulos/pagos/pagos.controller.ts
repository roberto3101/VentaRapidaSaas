import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PagosService } from './pagos.service';
import { IniciarPagoDto } from './dto/iniciar-pago.dto';
import { AnularPagoDto } from './dto/anular-pago.dto';
import { ReembolsarPagoDto } from './dto/reembolsar-pago.dto';
import { CrearStoreCreditDto } from './dto/crear-store-credit.dto';
import { FiltrosPagoDto } from './dto/filtros-pago.dto';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Controller('pagos')
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Post()
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  iniciar(@Body() dto: IniciarPagoDto, @UsuarioActual() usuario: JwtPayload) {
    return this.pagos.iniciar(dto, usuario);
  }

  @Post('store-credits')
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  crearStoreCredit(@Body() dto: CrearStoreCreditDto, @UsuarioActual() usuario: JwtPayload) {
    return this.pagos.crearStoreCredit(dto, usuario);
  }

  @Get('store-credits')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  listarStoreCredits(
    @Query('customerId') customerId: string | undefined,
    @Query('status') status: string | undefined,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.pagos.listarStoreCredits({ customerId, status }, usuario);
  }

  @Post(':id/anular')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  anular(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: AnularPagoDto,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.pagos.anular(id, dto, usuario);
  }

  @Post(':id/reembolsar')
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  reembolsar(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: ReembolsarPagoDto,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.pagos.reembolsar(id, dto, usuario);
  }

  @Get()
  listar(@Query() filtros: FiltrosPagoDto, @UsuarioActual() usuario: JwtPayload) {
    return this.pagos.listar(filtros, usuario);
  }

  @Get(':id')
  obtenerPorId(@Param('id', ValidarUuidPipe) id: string, @UsuarioActual() usuario: JwtPayload) {
    return this.pagos.obtenerPorId(id, usuario);
  }
}
