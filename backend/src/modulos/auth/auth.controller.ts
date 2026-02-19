import { Controller, Post, Body, Get, Ip, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegistroDto } from './dto/registro.dto';
import { RegistroTenantDto } from './dto/registro-tenant.dto';
import { Publico } from '../../common/decoradores/publico.decorator';
import { UsuarioActual } from '../../common/decoradores/usuario-actual.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async iniciarSesion(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.iniciarSesion(dto, ip);
  }

  @Publico()
  @Post('registro')
  async registrar(@Body() dto: RegistroDto) {
    return this.authService.registrarUsuario(dto);
  }

  @Publico()
  @Post('registro-tenant')
  async registrarTenant(@Body() dto: RegistroTenantDto) {
    return this.authService.registrarTenant(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refrescar(
    @UsuarioActual('sub') userId: string,
    @Body('tokenRefresh') tokenRefresh: string,
  ) {
    return this.authService.refrescarTokens(userId, tokenRefresh);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async cerrarSesion(@UsuarioActual('sub') userId: string) {
    await this.authService.cerrarSesion(userId);
    return { mensaje: 'Sesión cerrada correctamente' };
  }

  @Get('perfil')
  async obtenerPerfil(@UsuarioActual('sub') userId: string) {
    return this.authService.obtenerPerfilActual(userId);
  }
}
