import { Module } from '@nestjs/common';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

// Fleet (Truck) master data. PrismaService is global; RBAC guards/factory come
// from the global RbacModule.
@Module({
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
