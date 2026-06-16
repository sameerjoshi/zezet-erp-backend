import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { ClientBillablesReportResponseDto } from './dto/client-billables-report-response.dto';
import { OperationalReportResponseDto } from './dto/operational-report-response.dto';
import { ReportRangeQueryDto } from './dto/report-range-query.dto';
import { TripsReportResponseDto } from './dto/trips-report-response.dto';
import { TruckPnlResponseDto } from './dto/truck-pnl-response.dto';
import { UtilizationReportResponseDto } from './dto/utilization-report-response.dto';
import { WorkerPayReportResponseDto } from './dto/worker-pay-report-response.dto';
import { ReportingService } from './reporting.service';

// Reporting — date-range aggregates for the management dashboard. Every route is
// guarded on the virtual `Report` subject, so operations roles (ops_manager,
// ops_staff, driver) are 403'd outright; only admin/finance/investor read these.
// Money-bearing reports (worker-pay, client-billables) also pass through the
// global financial gate, but all `Report` readers can read `Financial`, so the
// figures are returned to them intact.
@ApiTags('reporting')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@UseGuards(JwtAuthGuard, PoliciesGuard)
@RequireAbility(Action.Read, 'Report')
@Controller('reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('trips')
  @ApiOperation({ summary: 'Trip counts per day and per truck for a range' })
  @ApiOkResponse({ type: TripsReportResponseDto })
  trips(@Query() query: ReportRangeQueryDto): Promise<TripsReportResponseDto> {
    return this.reporting.trips(query);
  }

  @Get('utilization')
  @ApiOperation({ summary: 'Active-truck utilization per day for a range' })
  @ApiOkResponse({ type: UtilizationReportResponseDto })
  utilization(
    @Query() query: ReportRangeQueryDto,
  ): Promise<UtilizationReportResponseDto> {
    return this.reporting.utilization(query);
  }

  @Get('operational')
  @ApiOperation({
    summary:
      'Operating vs idle (no clients) vs broken per day, with operating %',
  })
  @ApiOkResponse({ type: OperationalReportResponseDto })
  operational(
    @Query() query: ReportRangeQueryDto,
  ): Promise<OperationalReportResponseDto> {
    return this.reporting.operational(query);
  }

  @Get('truck-pnl')
  @ApiOperation({
    summary: 'Per-truck profit & loss (revenue − fuel − pay − costs)',
  })
  @ApiOkResponse({ type: TruckPnlResponseDto })
  truckPnl(@Query() query: ReportRangeQueryDto): Promise<TruckPnlResponseDto> {
    return this.reporting.truckPnl(query);
  }

  @Get('worker-pay')
  @ApiOperation({ summary: 'Total driver + helper pay per worker (financial)' })
  @ApiOkResponse({ type: WorkerPayReportResponseDto })
  workerPay(
    @Query() query: ReportRangeQueryDto,
  ): Promise<WorkerPayReportResponseDto> {
    return this.reporting.workerPay(query);
  }

  @Get('client-billables')
  @ApiOperation({ summary: 'Total billable per client (financial)' })
  @ApiOkResponse({ type: ClientBillablesReportResponseDto })
  clientBillables(
    @Query() query: ReportRangeQueryDto,
  ): Promise<ClientBillablesReportResponseDto> {
    return this.reporting.clientBillables(query);
  }
}
