import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secreto') ?? 'fallback-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const usuario = await this.db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, deletedAt: true, lockedUntil: true },
    });

    if (!usuario || !usuario.isActive || usuario.deletedAt) {
      throw new UnauthorizedException('Usuario inactivo o eliminado');
    }

    if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
      throw new UnauthorizedException('Cuenta bloqueada temporalmente');
    }

    return payload;
  }
}
