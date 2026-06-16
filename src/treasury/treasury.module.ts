import { Module } from '@nestjs/common';
import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';

// Treasury (ADR 0007). Accounts + categorized cash ledger + cash position.
// PrismaService global; RBAC from the global RbacModule. Manual ledger for now
// (auto-posting from Billing/Payroll deferred).
@Module({
  controllers: [TreasuryController],
  providers: [TreasuryService],
})
export class TreasuryModule {}
