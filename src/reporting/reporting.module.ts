import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

// Reporting (role-gated date-range aggregates). PrismaService is global; RBAC
// guards come from the global RbacModule. No event subscriptions — reports are
// computed on demand from the operational tables.
@Module({
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
