import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

// Operations (DailyTruckLog + Trip). Imports PricingModule to reuse the shared
// effective-rate selection for trip prepopulation. PrismaService and the event
// bus (EventEmitter2) are global; RBAC guards come from the global RbacModule.
@Module({
  imports: [PricingModule],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
