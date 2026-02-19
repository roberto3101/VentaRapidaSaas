import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('tokenRefresh'),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secretoRefresh') ?? 'fallback-refresh',
      passReqToCallback: true,
    } as any);
  }

  async validate(req: Request, payload: any) {
    const tokenRefresh = req.body?.tokenRefresh;
    if (!tokenRefresh) {
      throw new UnauthorizedException('Token de refresh no proporcionado');
    }
    return { ...payload, tokenRefresh };
  }
}
