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
import { BillingService } from './billing.service';
import {
  BillableQueryDto,
  ListInvoicesQueryDto,
} from './dto/billing-query.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  AgingResponseDto,
  BillablePreviewResponseDto,
  InvoiceDetailResponseDto,
  InvoiceResponseDto,
} from './dto/invoice-response.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

// Billing / AR. Financial subject: admin/finance manage, investor reads; ops
// roles are 403'd. Static sub-routes (`billable`, `aging`) are declared before
// `:id` so the param route does not capture them.
@ApiTags('billing')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('invoices')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billable')
  @RequireAbility(Action.Read, 'Invoice')
  @ApiOperation({ summary: 'Preview the trips billable for a client + period' })
  @ApiOkResponse({ type: BillablePreviewResponseDto })
  billable(
    @Query() query: BillableQueryDto,
  ): Promise<BillablePreviewResponseDto> {
    return this.billing.billable(query);
  }

  @Get('aging')
  @RequireAbility(Action.Read, 'Invoice')
  @ApiOperation({
    summary: 'AR aging of outstanding (sent) invoices per client',
  })
  @ApiOkResponse({ type: AgingResponseDto })
  aging(): Promise<AgingResponseDto> {
    return this.billing.aging();
  }

  @Get()
  @RequireAbility(Action.Read, 'Invoice')
  @ApiOperation({ summary: 'List invoices (filter by status/client)' })
  @ApiOkResponse({ type: InvoiceResponseDto, isArray: true })
  list(@Query() query: ListInvoicesQueryDto): Promise<InvoiceResponseDto[]> {
    return this.billing.list(query);
  }

  @Get(':id')
  @RequireAbility(Action.Read, 'Invoice')
  @ApiOperation({ summary: 'Invoice detail with its lines' })
  @ApiOkResponse({ type: InvoiceDetailResponseDto })
  get(@Param('id') id: string): Promise<InvoiceDetailResponseDto> {
    return this.billing.getDetail(id);
  }

  @Post()
  @RequireAbility(Action.Create, 'Invoice')
  @ApiOperation({ summary: 'Create a draft invoice from a client + period' })
  @ApiOkResponse({ type: InvoiceDetailResponseDto })
  create(
    @Body() dto: CreateInvoiceDto,
    @Req() req: Request & { user: AuthUser },
  ): Promise<InvoiceDetailResponseDto> {
    return this.billing.create(dto, req.user);
  }

  @Patch(':id')
  @RequireAbility(Action.Update, 'Invoice')
  @ApiOperation({ summary: 'Transition status (send/paid/void) or edit notes' })
  @ApiOkResponse({ type: InvoiceDetailResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ): Promise<InvoiceDetailResponseDto> {
    return this.billing.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireAbility(Action.Delete, 'Invoice')
  @ApiOperation({ summary: 'Delete a draft invoice' })
  remove(@Param('id') id: string): Promise<void> {
    return this.billing.remove(id);
  }
}
