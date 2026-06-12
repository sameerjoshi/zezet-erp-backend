import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

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
    // Remaining domain modules (Fleet, Workforce, Clients, Pricing,
    // Operations, Reporting) are added during Phase 0–1 dev.
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
