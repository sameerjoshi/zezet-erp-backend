import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Admin user/role administration. PrismaService is global; RBAC guards/factory
// come from the global RbacModule.
@Module({
  controllers: [UsersController, RolesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
