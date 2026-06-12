import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditEntity } from '../audit/audit-entity.decorator';
import { Action } from '../rbac/casl-ability.factory';
import { RequireAbility } from '../rbac/policies.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { SetRolesDto } from './dto/set-roles.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

// Admin-only user administration. Every route requires `manage User`, which
// only the admin role holds — finance's broad read access does NOT reach here.
@ApiTags('users')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@AuditEntity('User')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@RequireAbility(Action.Manage, 'User')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a user with a generated username and initial roles',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List users (never includes passwordHash)' })
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  list(): Promise<UserResponseDto[]> {
    return this.usersService.list();
  }

  @Patch(':id/roles')
  @ApiOperation({ summary: "Replace a user's roles" })
  @ApiOkResponse({ type: UserResponseDto })
  setRoles(
    @Param('id') id: string,
    @Body() dto: SetRolesDto,
  ): Promise<UserResponseDto> {
    return this.usersService.setRoles(id, dto.roles);
  }
}
