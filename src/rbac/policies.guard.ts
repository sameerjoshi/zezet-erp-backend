import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppAbility, CaslAbilityFactory } from './casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from './policies.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

// Enforces the CASL policies declared with @CheckPolicies()/@RequireAbility().
// MUST run after JwtAuthGuard so req.user (and therefore the ability) is set:
//   @UseGuards(JwtAuthGuard, PoliciesGuard)
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers =
      this.reflector.getAllAndOverride<PolicyHandler[]>(CHECK_POLICIES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    // No policy declared → this guard imposes nothing (auth still handled by
    // whatever guard precedes it).
    if (handlers.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const ability = this.caslFactory.createForUser(request.user);

    const ok = handlers.every((handler) => execPolicy(handler, ability));
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}

function execPolicy(handler: PolicyHandler, ability: AppAbility): boolean {
  return typeof handler === 'function'
    ? handler(ability)
    : handler.handle(ability);
}
