import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { Action } from '../rbac/casl-ability.factory';
import { RequireAbility } from '../rbac/policies.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CostsService } from './costs.service';
import { ListCostsQueryDto } from './dto/cost-query.dto';
import { CostResponseDto } from './dto/cost-response.dto';
import { CreateCostDto } from './dto/create-cost.dto';

// Per-truck costs. Financial subject: admin/finance manage, investor reads; ops
// roles are 403'd.
@ApiTags('costs')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('truck-costs')
export class CostsController {
  constructor(private readonly costs: CostsService) {}

  @Get()
  @RequireAbility(Action.Read, 'Cost')
  @ApiOperation({ summary: 'List truck costs (filter by truck/date range)' })
  @ApiOkResponse({ type: CostResponseDto, isArray: true })
  list(@Query() query: ListCostsQueryDto): Promise<CostResponseDto[]> {
    return this.costs.list(query);
  }

  @Post()
  @RequireAbility(Action.Create, 'Cost')
  @ApiOperation({ summary: 'Record a truck cost' })
  @ApiOkResponse({ type: CostResponseDto })
  create(
    @Body() dto: CreateCostDto,
    @Req() req: Request & { user: AuthUser },
  ): Promise<CostResponseDto> {
    return this.costs.create(dto, req.user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireAbility(Action.Delete, 'Cost')
  @ApiOperation({ summary: 'Delete a truck cost' })
  remove(@Param('id') id: string): Promise<void> {
    return this.costs.remove(id);
  }
}
