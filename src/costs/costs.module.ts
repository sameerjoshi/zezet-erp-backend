import { Module } from '@nestjs/common';
import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';

// Per-truck cost tracking (ADR 0006). The P&L report that consumes these lives in
// ReportingModule. PrismaService global; RBAC from the global RbacModule.
@Module({
  controllers: [CostsController],
  providers: [CostsService],
})
export class CostsModule {}
