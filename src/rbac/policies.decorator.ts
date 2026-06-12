import { SetMetadata } from '@nestjs/common';
import { Action, AppAbility, AppSubject } from './casl-ability.factory';

// A policy handler answers "does this ability satisfy the requirement?".
// Either a plain callback or an object with a `handle` method (for reusable,
// injectable-free policy classes).
export interface IPolicyHandler {
  handle(ability: AppAbility): boolean;
}
export type PolicyHandlerCallback = (ability: AppAbility) => boolean;
export type PolicyHandler = IPolicyHandler | PolicyHandlerCallback;

export const CHECK_POLICIES_KEY = 'check_policies';

// Declare one or more required policies on a route (or whole controller).
// All declared handlers must pass (logical AND). Example:
//   @CheckPolicies((a) => a.can(Action.Manage, 'User'))
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);

// Ergonomic shorthand for the common "can <action> <subject>" case:
//   @RequireAbility(Action.Manage, 'User')
export const RequireAbility = (action: Action, subject: AppSubject) =>
  CheckPolicies((ability) => ability.can(action, subject));
