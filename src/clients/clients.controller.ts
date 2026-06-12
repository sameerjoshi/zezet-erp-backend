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
import { ClientsService } from './clients.service';
import { ClientResponseDto } from './dto/client-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';

// Clients master data. Reads need `read Client`; mutations need
// `create`/`update Client` (ops_manager + admin).
@ApiTags('clients')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@AuditEntity('Client')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequireAbility(Action.Create, 'Client')
  @ApiOperation({ summary: 'Create a client' })
  @ApiCreatedResponse({ type: ClientResponseDto })
  create(@Body() dto: CreateClientDto): Promise<ClientResponseDto> {
    return this.clientsService.create(dto);
  }

  @Get()
  @RequireAbility(Action.Read, 'Client')
  @ApiOperation({ summary: 'List clients (optionally filtered by status)' })
  @ApiOkResponse({ type: ClientResponseDto, isArray: true })
  list(@Query() query: ListClientsQueryDto): Promise<ClientResponseDto[]> {
    return this.clientsService.list(query.status);
  }

  @Get(':id')
  @RequireAbility(Action.Read, 'Client')
  @ApiOperation({ summary: 'Get a client by id' })
  @ApiOkResponse({ type: ClientResponseDto })
  get(@Param('id') id: string): Promise<ClientResponseDto> {
    return this.clientsService.get(id);
  }

  @Patch(':id')
  @RequireAbility(Action.Update, 'Client')
  @ApiOperation({ summary: 'Update a client' })
  @ApiOkResponse({ type: ClientResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientResponseDto> {
    return this.clientsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @RequireAbility(Action.Update, 'Client')
  @ApiOperation({ summary: 'Soft-deactivate a client (status → disabled)' })
  @ApiOkResponse({ type: ClientResponseDto })
  deactivate(@Param('id') id: string): Promise<ClientResponseDto> {
    return this.clientsService.deactivate(id);
  }
}
