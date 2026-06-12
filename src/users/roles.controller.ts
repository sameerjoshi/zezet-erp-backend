import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Action } from '../rbac/casl-ability.factory';
import { RequireAbility } from '../rbac/policies.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { RoleResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

// Admin-only: list the assignable roles. Requires `manage Role` (admin only).
@ApiTags('roles')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@UseGuards(JwtAuthGuard, PoliciesGuard)
@RequireAbility(Action.Manage, 'Role')
@Controller('roles')
export class RolesController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List roles' })
  @ApiOkResponse({ type: RoleResponseDto, isArray: true })
  list(): Promise<RoleResponseDto[]> {
    return this.usersService.listRoles();
  }
}
