import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

// Billing / AR (ADR 0004). Invoices over arbitrary client-driven periods with
// frozen trip-line snapshots. PrismaService is global; RBAC guards come from the
// global RbacModule. Reads trips on demand (no event subscription yet).
@Module({
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
