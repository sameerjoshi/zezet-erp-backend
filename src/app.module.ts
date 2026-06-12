import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { FleetModule } from './fleet/fleet.module';
import { OperationsModule } from './operations/operations.module';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { WorkforceModule } from './workforce/workforce.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    // Remaining domain modules (Reporting) are added later.
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
