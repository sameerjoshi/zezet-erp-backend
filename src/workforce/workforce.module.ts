import { Module } from '@nestjs/common';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';

// Workforce (Worker) master data.
@Module({
  controllers: [WorkforceController],
  providers: [WorkforceService],
  exports: [WorkforceService],
})
export class WorkforceModule {}
