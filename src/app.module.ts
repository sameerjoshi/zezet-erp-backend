import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { envValidationSchema } from './config/env.validation';
import { FleetModule } from './fleet/fleet.module';
import { OperationsModule } from './operations/operations.module';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { ReportingModule } from './reporting/reporting.module';
import { UsersModule } from './users/users.module';
import { WorkforceModule } from './workforce/workforce.module';

// Login/refresh throttle: 10 requests / minute / IP. Applied narrowly — only the
// auth routes attach ThrottlerGuard (see AuthController); the rest of the API is
// unthrottled. ThrottlerModule is @Global, so the guard resolves anywhere.
const AUTH_THROTTLE_TTL_MS = 60_000;
const AUTH_THROTTLE_LIMIT = 10;

@Module({
  imports: [
    // Boot-time env contract — a missing/garbage required var crashes startup
    // (fail fast) instead of failing lazily mid-request. `allowUnknown` lets
    // unrelated env (PATH, PORT, NODE_ENV, SEED_*) through.
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    ThrottlerModule.forRoot([
      { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT },
    ]),
    // Internal event bus — domain modules emit events (e.g. trip.created);
    // later modules (Billing/Payroll) subscribe without coupling. See CLAUDE.md.
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    // Section 2 — RBAC (CASL abilities + policies guard + financial field gate),
    // admin Users/Roles endpoints, and the global audit-log interceptor.
    RbacModule,
    UsersModule,
    AuditModule,
    // Section 3 — master data (Fleet/Workforce/Clients) + Pricing (rate cards,
    // rates, effective-rate lookup for trip prepopulation).
    FleetModule,
    WorkforceModule,
    ClientsModule,
    PricingModule,
    // Section 4 — Operations: DailyTruckLog + the Trip (the universal record),
    // rate-prepopulated trips, non-blocking warnings, and the `trip.created`
    // event for downstream Billing/Payroll.
    OperationsModule,
    // Section 5 — Reporting: role-gated (`Report` subject) date-range aggregates
    // (trips, utilization, worker-pay, client-billables) for the dashboard.
    ReportingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
