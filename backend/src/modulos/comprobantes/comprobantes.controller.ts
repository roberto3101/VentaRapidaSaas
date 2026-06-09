import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ComprobantesService } from './comprobantes.service';
import { EmitirComprobanteDto } from './dto/emitir-comprobante.dto';
import { AnularComprobanteDto } from './dto/anular-comprobante.dto';
import { FiltrosComprobanteDto } from './dto/filtros-comprobante.dto';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';
import { Roles } from '../../common/decoradores/roles.decorator';
import { Rol } from '../../common/constantes/roles.constant';
import { ValidarUuidPipe } from '../../common/pipes/validar-uuid.pipe';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Controller('comprobantes')
export class ComprobantesController {
  constructor(private readonly comprobantes: ComprobantesService) {}

  @Post('emitir')
  @Roles(Rol.OPERATOR, Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  emitir(@Body() dto: EmitirComprobanteDto, @UsuarioActual() usuario: JwtPayload) {
    return this.comprobantes.emitir(dto, usuario);
  }

  @Post(':id/anular')
  @Roles(Rol.LOCATION_MANAGER, Rol.TENANT_ADMIN)
  anular(
    @Param('id', ValidarUuidPipe) id: string,
    @Body() dto: AnularComprobanteDto,
    @UsuarioActual() usuario: JwtPayload,
  ) {
    return this.comprobantes.anular(id, dto, usuario);
  }

  @Get()
  listar(@Query() filtros: FiltrosComprobanteDto, @UsuarioActual() usuario: JwtPayload) {
    return this.comprobantes.listar(filtros, usuario);
  }

  @Get(':id')
  obtenerPorId(@Param('id', ValidarUuidPipe) id: string, @UsuarioActual() usuario: JwtPayload) {
    return this.comprobantes.obtenerPorId(id, usuario);
  }

  @Get(':id/payload')
  obtenerPayload(@Param('id', ValidarUuidPipe) id: string, @UsuarioActual() usuario: JwtPayload) {
    return this.comprobantes.obtenerPayload(id, usuario);
  }
}
