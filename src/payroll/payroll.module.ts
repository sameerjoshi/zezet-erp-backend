import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

// Payroll (ADR 0005). Pay runs over periods with frozen per-trip pay lines.
// Symmetric with Billing. PrismaService global; RBAC from the global RbacModule.
@Module({
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
