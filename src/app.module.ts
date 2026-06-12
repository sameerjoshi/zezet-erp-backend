import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Internal event bus — domain modules emit events (e.g. trip.created);
    // later modules (Billing/Payroll) subscribe without coupling. See CLAUDE.md.
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    // Remaining domain modules (RBAC, Fleet, Workforce, Clients, Pricing,
    // Operations, Reporting, Audit) are added during Phase 0–1 dev.
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
