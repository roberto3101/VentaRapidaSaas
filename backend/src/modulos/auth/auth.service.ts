import {
  Injectable, UnauthorizedException, ConflictException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { LoginDto } from './dto/login.dto';
import { RegistroDto } from './dto/registro.dto';
import { RegistroTenantDto } from './dto/registro-tenant.dto';
import { TokensDto } from './dto/tokens.dto';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { hashearContrasena, compararContrasena, hashearToken, compararToken } from '../../common/utils/hash.util';
import { Rol } from '../../common/constantes/roles.constant';
import { generarSlug } from '../../common/utils/slug.util';

const MAX_INTENTOS_FALLIDOS = 5;
const MINUTOS_BLOQUEO = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async iniciarSesion(dto: LoginDto, ip?: string): Promise<TokensDto> {
    const usuario = await this.db.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      include: { userLocations: { select: { locationId: true } } },
    });

    if (!usuario) throw new UnauthorizedException('Credenciales incorrectas');

    if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
      const min = Math.ceil((usuario.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Cuenta bloqueada. Intenta en ${min} minutos`);
    }

    const valida = await compararContrasena(dto.contrasena, usuario.passwordHash);
    if (!valida) {
      await this.registrarIntentoFallido(usuario.id);
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    if (!usuario.isActive) throw new UnauthorizedException('Tu cuenta está desactivada');

    await this.db.user.update({
      where: { id: usuario.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
    });

    const tokens = await this.generarTokens({
      sub: usuario.id,
      tenantId: usuario.tenantId,
      email: usuario.email,
      rol: usuario.role as Rol,
      sedesIds: usuario.userLocations.map((ul) => ul.locationId),
    });

    const hashRefresh = await hashearToken(tokens.tokenRefresh);
    await this.db.user.update({ where: { id: usuario.id }, data: { refreshTokenHash: hashRefresh } });

    return tokens;
  }

  async registrarUsuario(dto: RegistroDto): Promise<{ id: string; email: string }> {
    const existente = await this.db.user.findFirst({ where: { email: dto.email, deletedAt: null } });
    if (existente) throw new ConflictException('Ya existe un usuario con este email');

    const passwordHash = await hashearContrasena(dto.contrasena);
    return this.db.user.create({
      data: {
        email: dto.email, passwordHash, fullName: dto.nombreCompleto,
        phone: dto.telefono, role: (dto.rol as any) || 'operator', tenantId: dto.tenantId,
      },
      select: { id: true, email: true },
    });
  }

  async registrarTenant(dto: RegistroTenantDto): Promise<TokensDto> {
    const existente = await this.db.user.findFirst({ where: { email: dto.email, deletedAt: null } });
    if (existente) throw new ConflictException('Ya existe un usuario con este email');

    const slug = generarSlug(dto.nombreNegocio) + '-' + Date.now().toString(36);

    const tenant = await this.db.tenant.create({
      data: {
        name: dto.nombreNegocio, slug,
        countryCode: dto.codigoPais, currencyCode: dto.codigoMoneda,
        currencySymbol: dto.simboloMoneda, timezone: dto.zonaHoraria || 'America/Lima',
        taxName: dto.nombreImpuesto || 'IGV', taxRate: dto.tasaImpuesto ?? 18,
        taxIncluded: dto.impuestoIncluido ?? true, plan: 'free',
      },
    });

    const passwordHash = await hashearContrasena(dto.contrasena);
    const usuario = await this.db.user.create({
      data: {
        tenantId: tenant.id, email: dto.email, passwordHash,
        fullName: dto.nombreCompleto, role: 'tenant_admin',
      },
    });

    const sede = await this.db.location.create({
      data: { tenantId: tenant.id, name: 'Sede Principal', code: 'MAIN', countryCode: dto.codigoPais },
    });

    await this.db.userLocation.create({
      data: { userId: usuario.id, locationId: sede.id, isDefault: true },
    });

    const tokens = await this.generarTokens({
      sub: usuario.id, tenantId: tenant.id, email: usuario.email,
      rol: Rol.TENANT_ADMIN, sedesIds: [sede.id],
    });

    const hashRefresh = await hashearToken(tokens.tokenRefresh);
    await this.db.user.update({ where: { id: usuario.id }, data: { refreshTokenHash: hashRefresh } });

    this.logger.log(`Nuevo tenant registrado: ${tenant.name} (${tenant.id})`);
    return tokens;
  }

  async refrescarTokens(userId: string, tokenRefreshActual: string): Promise<TokensDto> {
    const usuario = await this.db.user.findUnique({
      where: { id: userId },
      include: { userLocations: { select: { locationId: true } } },
    });

    if (!usuario || !usuario.refreshTokenHash || !usuario.isActive) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const valido = await compararToken(tokenRefreshActual, usuario.refreshTokenHash);
    if (!valido) {
      await this.db.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Token inválido. Sesiones cerradas por seguridad');
    }

    const tokens = await this.generarTokens({
      sub: usuario.id, tenantId: usuario.tenantId, email: usuario.email,
      rol: usuario.role as Rol, sedesIds: usuario.userLocations.map((ul) => ul.locationId),
    });

    const hashRefresh = await hashearToken(tokens.tokenRefresh);
    await this.db.user.update({ where: { id: userId }, data: { refreshTokenHash: hashRefresh } });
    return tokens;
  }

  async cerrarSesion(userId: string): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
  }

  async obtenerPerfilActual(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, fullName: true, phone: true, role: true,
        avatarUrl: true, tenantId: true, preferredLocationId: true,
        lastLoginAt: true, mustChangePassword: true,
        userLocations: {
          select: {
            locationId: true, isDefault: true,
            location: { select: { id: true, name: true, code: true } },
          },
        },
        tenant: {
          select: {
            id: true, name: true, slug: true, currencyCode: true,
            currencySymbol: true, timezone: true, taxName: true, taxRate: true,
          },
        },
      },
    });
  }

  private async generarTokens(payload: JwtPayload): Promise<TokensDto> {
    const [tokenAcceso, tokenRefresh] = await Promise.all([
      this.jwt.signAsync(payload as any, {
        secret: this.config.get<string>('jwt.secreto'),
        expiresIn: (this.config.get<string>('jwt.expiracion') ?? '15m') as any,
      }),
      this.jwt.signAsync({ sub: payload.sub } as any, {
        secret: this.config.get<string>('jwt.secretoRefresh'),
        expiresIn: (this.config.get<string>('jwt.expiracionRefresh') ?? '7d') as any,
      }),
    ]);
    return { tokenAcceso, tokenRefresh, tipoToken: 'Bearer', expiraEn: 900 };
  }

  private async registrarIntentoFallido(userId: string): Promise<void> {
    const usuario = await this.db.user.update({
      where: { id: userId }, data: { failedAttempts: { increment: 1 } },
    });
    if ((usuario.failedAttempts ?? 0) >= MAX_INTENTOS_FALLIDOS) {
      await this.db.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + MINUTOS_BLOQUEO * 60 * 1000), failedAttempts: 0 },
      });
      this.logger.warn(`Cuenta bloqueada: ${userId}`);
    }
  }
}
