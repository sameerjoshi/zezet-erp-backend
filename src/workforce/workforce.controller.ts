import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { AuditEntity } from '../audit/audit-entity.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Action } from '../rbac/casl-ability.factory';
import { RequireAbility } from '../rbac/policies.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { ListWorkersQueryDto } from './dto/list-workers-query.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkerResponseDto } from './dto/worker-response.dto';
import { WorkforceService } from './workforce.service';

// Workers (drivers/helpers master data). Reads need `read Worker`; mutations
// need `create`/`update Worker` (ops_manager + admin).
@ApiTags('workforce')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@AuditEntity('Worker')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('workers')
export class WorkforceController {
  constructor(private readonly workforceService: WorkforceService) {}

  @Post()
  @RequireAbility(Action.Create, 'Worker')
  @ApiOperation({ summary: 'Create a worker' })
  @ApiCreatedResponse({ type: WorkerResponseDto })
  create(@Body() dto: CreateWorkerDto): Promise<WorkerResponseDto> {
    return this.workforceService.create(dto);
  }

  @Get()
  @RequireAbility(Action.Read, 'Worker')
  @ApiOperation({ summary: 'List workers (filter by status/type)' })
  @ApiOkResponse({ type: WorkerResponseDto, isArray: true })
  list(@Query() query: ListWorkersQueryDto): Promise<WorkerResponseDto[]> {
    return this.workforceService.list(query);
  }

  @Get(':id')
  @RequireAbility(Action.Read, 'Worker')
  @ApiOperation({ summary: 'Get a worker by id' })
  @ApiOkResponse({ type: WorkerResponseDto })
  get(@Param('id') id: string): Promise<WorkerResponseDto> {
    return this.workforceService.get(id);
  }

  @Patch(':id')
  @RequireAbility(Action.Update, 'Worker')
  @ApiOperation({ summary: 'Update a worker' })
  @ApiOkResponse({ type: WorkerResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkerDto,
  ): Promise<WorkerResponseDto> {
    return this.workforceService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @RequireAbility(Action.Update, 'Worker')
  @ApiOperation({ summary: 'Soft-deactivate a worker (status → disabled)' })
  @ApiOkResponse({ type: WorkerResponseDto })
  deactivate(@Param('id') id: string): Promise<WorkerResponseDto> {
    return this.workforceService.deactivate(id);
  }
}
