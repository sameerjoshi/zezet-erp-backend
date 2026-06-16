import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
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
import { CreateRunDto } from './dto/create-run.dto';
import {
  ListRunsQueryDto,
  PayrollPreviewQueryDto,
} from './dto/payroll-query.dto';
import {
  PayrollPreviewResponseDto,
  PayrollRunDetailResponseDto,
  PayrollRunResponseDto,
} from './dto/run-response.dto';
import { UpdateRunDto } from './dto/update-run.dto';
import { PayrollService } from './payroll.service';

// Payroll. Financial subject: admin/finance manage, investor reads; ops denied.
// Static `preview` is declared before `:id`.
@ApiTags('payroll')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('preview')
  @RequireAbility(Action.Read, 'Payroll')
  @ApiOperation({ summary: 'Preview per-worker pay for a period' })
  @ApiOkResponse({ type: PayrollPreviewResponseDto })
  preview(
    @Query() query: PayrollPreviewQueryDto,
  ): Promise<PayrollPreviewResponseDto> {
    return this.payroll.preview(query);
  }

  @Get()
  @RequireAbility(Action.Read, 'Payroll')
  @ApiOperation({ summary: 'List pay runs (filter by status)' })
  @ApiOkResponse({ type: PayrollRunResponseDto, isArray: true })
  list(@Query() query: ListRunsQueryDto): Promise<PayrollRunResponseDto[]> {
    return this.payroll.list(query);
  }

  @Get(':id')
  @RequireAbility(Action.Read, 'Payroll')
  @ApiOperation({ summary: 'Pay run detail with per-worker statements' })
  @ApiOkResponse({ type: PayrollRunDetailResponseDto })
  get(@Param('id') id: string): Promise<PayrollRunDetailResponseDto> {
    return this.payroll.getDetail(id);
  }

  @Post()
  @RequireAbility(Action.Create, 'Payroll')
  @ApiOperation({ summary: 'Create a draft pay run for a period' })
  @ApiOkResponse({ type: PayrollRunDetailResponseDto })
  create(
    @Body() dto: CreateRunDto,
    @Req() req: Request & { user: AuthUser },
  ): Promise<PayrollRunDetailResponseDto> {
    return this.payroll.create(dto, req.user);
  }

  @Patch(':id')
  @RequireAbility(Action.Update, 'Payroll')
  @ApiOperation({
    summary: 'Transition status (approve/paid/void) or edit notes',
  })
  @ApiOkResponse({ type: PayrollRunDetailResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRunDto,
  ): Promise<PayrollRunDetailResponseDto> {
    return this.payroll.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireAbility(Action.Delete, 'Payroll')
  @ApiOperation({ summary: 'Delete a draft pay run' })
  remove(@Param('id') id: string): Promise<void> {
    return this.payroll.remove(id);
  }
}
