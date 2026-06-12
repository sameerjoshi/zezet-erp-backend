import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleKey, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { MeResponseDto } from './dto/auth-response.dto';

// User loaded with roles for token issuance / profile.
type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

// Refresh-token JWT payload (kept minimal; the jti is the revocation handle).
interface RefreshPayload {
  sub: string;
  jti: string;
}

// What the service hands back to the controller: the controller puts the
// refresh token in an httpOnly cookie and returns only the access fields in
// the body (ADR 0001).
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // One active refresh token per user → key holds the current jti. Overwriting on
  // login/refresh implicitly revokes the previous session; logout deletes it.
  private refreshKey(userId: string): string {
    return `refresh:${userId}`;
  }

  async login(dto: LoginDto): Promise<IssuedTokens> {
    const user = await this.validateUser(dto.username, dto.password);
    return this.issueTokens(user);
  }

  // Verify a refresh token against Redis, rotate it, and issue a fresh pair.
  async refresh(refreshToken: string): Promise<IssuedTokens> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.redis.get(this.refreshKey(payload.sub));
    // Mismatch ⇒ token was rotated, revoked, or replayed.
    if (!stored || stored !== payload.jti) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('Account is not active');
    }
    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.redis.del(this.refreshKey(userId));
  }

  async me(userId: string): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      username: user.username,
      locale: user.locale,
      roles: this.roleKeys(user),
    };
  }

  private async validateUser(
    username: string,
    password: string,
  ): Promise<UserWithRoles> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { roles: { include: { role: true } } },
    });
    // Same error whether the user is missing, disabled, or the password is wrong —
    // don't leak which usernames exist.
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  private async issueTokens(user: UserWithRoles): Promise<IssuedTokens> {
    const roles = this.roleKeys(user);
    const accessTtl = Number(this.config.getOrThrow<string>('JWT_ACCESS_TTL'));
    const refreshTtl = Number(
      this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
    );

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, username: user.username, roles },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessTtl,
      },
    );

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
      },
    );
    // Store the jti with a TTL matching the token so Redis self-cleans.
    await this.redis.set(this.refreshKey(user.id), jti, 'EX', refreshTtl);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtl,
    };
  }

  private roleKeys(user: UserWithRoles): RoleKey[] {
    return user.roles.map((ur) => ur.role.key);
  }
}
