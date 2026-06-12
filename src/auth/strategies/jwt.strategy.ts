import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { RoleKey } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

// Shape of the access-token payload we sign in AuthService.
export interface AccessTokenPayload {
  sub: string;
  username: string;
  roles: RoleKey[];
}

// What downstream handlers receive as req.user / @CurrentUser().
export interface AuthUser {
  userId: string;
  username: string;
  roles: RoleKey[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    return {
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles ?? [],
    };
  }
}
