import { ConfigService } from '@nestjs/config';
import { CookieOptions } from 'express';

// The refresh token rides in this httpOnly cookie (ADR 0001) — never the body,
// never readable by JS. Path is scoped to /auth so it's only sent to auth routes.
export const REFRESH_COOKIE = 'refresh_token';

// Shared options so set + clear stay in lockstep (mismatched options won't clear).
// Secure only in production; dev is localhost over http. SameSite=Lax assumes a
// same-site deployment (api.* + app.*) — see ADR 0001 for the cross-site caveat.
export function refreshCookieOptions(config: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get<string>('NODE_ENV') === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: Number(config.getOrThrow<string>('JWT_REFRESH_TTL')) * 1000,
  };
}
