import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../strategies/jwt.strategy';

// Pulls the authenticated user (set by JwtStrategy.validate) off the request.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthUser }>();
    return request.user;
  },
);
