import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import { Action, CaslAbilityFactory } from './casl-ability.factory';
import { FINANCIAL_FIELD_SET } from './financial-fields';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

// Field-level financial gate (HARD requirement).
//
// Registered globally (RbacModule → APP_INTERCEPTOR). For any request whose
// user CANNOT read the virtual `Financial` subject, it strips every money field
// (see FINANCIAL_FIELDS) from the serialized response — at any depth, including
// nested relations and arrays. Users who CAN read financial data pay no cost:
// the interceptor short-circuits with the original stream untouched.
//
// This is defence-in-depth: even if a future money endpoint forgets to project
// away its monetary columns, ops roles still never receive them.
@Injectable()
export class FinancialFieldsInterceptor implements NestInterceptor {
  constructor(private readonly caslFactory: CaslAbilityFactory) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only HTTP responses carry serialized bodies we can scrub.
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const ability = this.caslFactory.createForUser(request.user);

    // Allowed to see money → leave the payload (and performance) alone.
    if (ability.can(Action.Read, 'Financial')) {
      return next.handle();
    }

    const stream = next.handle();
    return stream.pipe(map((data: unknown) => stripFinancialFields(data)));
  }
}

// Returns a deep copy of `value` with every financial key removed. Pure (does
// not mutate the input). Only recurses into arrays and plain objects; class
// instances (Date, Prisma Decimal, Buffer, …) are returned untouched so we
// never mangle their internals — financial Decimals are dropped at the key
// level before we would ever descend into them.
export function stripFinancialFields<T>(value: T): T {
  return strip(value, new WeakSet<object>()) as T;
}

function strip(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => strip(item, seen));
  }

  if (isPlainObject(value)) {
    // Guard against pathological circular plain-object graphs.
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (FINANCIAL_FIELD_SET.has(key)) {
        continue;
      }
      out[key] = strip(val, seen);
    }
    return out;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}
