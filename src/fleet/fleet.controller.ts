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
import { CreateTruckDto } from './dto/create-truck.dto';
import { ListTrucksQueryDto } from './dto/list-trucks-query.dto';
import { TruckResponseDto } from './dto/truck-response.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { FleetService } from './fleet.service';

// Trucks (fleet master data). Reads need `read Truck` (ops + finance + admin);
// mutations need `create`/`update Truck` (ops_manager + admin). `purchasePrice`
// is financial — handled transparently by the global field gate.
@ApiTags('fleet')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@AuditEntity('Truck')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('trucks')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Post()
  @RequireAbility(Action.Create, 'Truck')
  @ApiOperation({ summary: 'Create a truck' })
  @ApiCreatedResponse({ type: TruckResponseDto })
  create(@Body() dto: CreateTruckDto): Promise<TruckResponseDto> {
    return this.fleetService.create(dto);
  }

  @Get()
  @RequireAbility(Action.Read, 'Truck')
  @ApiOperation({ summary: 'List trucks (optionally filtered by status)' })
  @ApiOkResponse({ type: TruckResponseDto, isArray: true })
  list(@Query() query: ListTrucksQueryDto): Promise<TruckResponseDto[]> {
    return this.fleetService.list(query.status);
  }

  @Get(':id')
  @RequireAbility(Action.Read, 'Truck')
  @ApiOperation({ summary: 'Get a truck by id' })
  @ApiOkResponse({ type: TruckResponseDto })
  get(@Param('id') id: string): Promise<TruckResponseDto> {
    return this.fleetService.get(id);
  }

  @Patch(':id')
  @RequireAbility(Action.Update, 'Truck')
  @ApiOperation({ summary: 'Update a truck' })
  @ApiOkResponse({ type: TruckResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTruckDto,
  ): Promise<TruckResponseDto> {
    return this.fleetService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @RequireAbility(Action.Update, 'Truck')
  @ApiOperation({ summary: 'Soft-deactivate a truck (status → inactive)' })
  @ApiOkResponse({ type: TruckResponseDto })
  deactivate(@Param('id') id: string): Promise<TruckResponseDto> {
    return this.fleetService.deactivate(id);
  }
}
