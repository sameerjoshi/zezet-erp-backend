import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_ENTITY_KEY } from './audit-entity.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

// HTTP method → audit action.
const ACTION_BY_METHOD: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

// Keys never persisted into the audit trail (secrets/tokens/PII-ish material).
const SENSITIVE_KEYS = new Set([
  'passwordHash',
  'password',
  'refreshToken',
  'accessToken',
  'token',
]);

// Writes an AuditLog row for every SUCCESSFUL mutating request
// (POST/PATCH/PUT/DELETE). Registered globally (AuditModule → APP_INTERCEPTOR).
//
// Resilience is a hard requirement: auditing is best-effort and fire-and-forget
// — a failure to write the log MUST NOT fail or delay the user's request.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const action = ACTION_BY_METHOD[request.method];

    // Only mutating verbs are audited.
    if (!action) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        // Only successful responses get a row (errors short-circuit `tap`).
        next: (result) => {
          this.record(context, request, action, result);
        },
      }),
    );
  }

  private record(
    context: ExecutionContext,
    request: Request & { user?: AuthUser },
    action: string,
    result: unknown,
  ): void {
    try {
      const entity = this.resolveEntity(context, request);
      const entityId = this.resolveEntityId(request, result);
      const after = action === 'delete' ? undefined : toJsonSafe(result);

      // Fire-and-forget. Swallow write failures so audit never breaks the
      // request; log them so they're not silent.
      void this.prisma.auditLog
        .create({
          data: {
            actorUserId: request.user?.userId,
            entity,
            entityId,
            action,
            after: after as never,
          },
        })
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to write audit log for ${action} ${entity}/${entityId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    } catch (err) {
      // Never let audit bookkeeping throw into the request pipeline.
      this.logger.error(
        `Audit interceptor error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Prefer the explicit @AuditEntity('User') metadata; otherwise derive a
  // best-effort name from the route's first path segment ('/users' → 'User').
  private resolveEntity(context: ExecutionContext, request: Request): string {
    const explicit = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_ENTITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (explicit) {
      return explicit;
    }
    const raw = request.baseUrl || request.path || request.url || '';
    const segment = raw.split('?')[0].split('/').filter(Boolean)[0];
    return singularize(segment || 'unknown');
  }

  private resolveEntityId(request: Request, result: unknown): string {
    const params = request.params as Record<string, string | undefined>;
    const fromParam = params?.id;
    if (fromParam) {
      return fromParam;
    }
    if (result && typeof result === 'object' && 'id' in result) {
      const id = (result as { id?: unknown }).id;
      if (typeof id === 'string') {
        return id;
      }
    }
    return 'unknown';
  }
}

// Coerce to a JSON-safe value Prisma's Json column accepts (Dates → ISO,
// Decimals → string via their toJSON) and strip sensitive keys.
function toJsonSafe(value: unknown): unknown {
  try {
    const json = JSON.stringify(value, (key: string, val: unknown) =>
      SENSITIVE_KEYS.has(key) ? undefined : val,
    );
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

function singularize(segment: string): string {
  const word = segment.endsWith('s') ? segment.slice(0, -1) : segment;
  return word.charAt(0).toUpperCase() + word.slice(1);
}
