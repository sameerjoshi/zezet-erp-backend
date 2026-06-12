import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditEntity } from '../audit/audit-entity.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { Action } from '../rbac/casl-ability.factory';
import { RequireAbility } from '../rbac/policies.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { DailyLogDetailResponseDto } from './dto/daily-log-detail-response.dto';
import { DailyLogResponseDto } from './dto/daily-log-response.dto';
import { GetDailyLogQueryDto } from './dto/get-daily-log-query.dto';
import { OperationsSummaryQueryDto } from './dto/operations-summary-query.dto';
import { OperationsSummaryResponseDto } from './dto/operations-summary-response.dto';
import { TripResponseDto } from './dto/trip-response.dto';
import { UpdateDailyLogDto } from './dto/update-daily-log.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { OperationsService } from './operations.service';

// Operations — the Trip is the universal record. All endpoints are guarded on
// the `Trip` subject (operations data): ops_staff can read + create + update,
// ops_manager manages (incl. delete), finance/admin see everything. Money
// fields (fuelCost, billAmount, driverPay, helperPay, totals) are stripped for
// ops roles by the global financial gate. Mutations are audited.
@ApiTags('operations')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@AuditEntity('Trip')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller()
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  // --- Dashboard summary ---

  @Get('operations/summary')
  @RequireAbility(Action.Read, 'Trip')
  @ApiOperation({
    summary: 'Per-truck log status for a date + fleet roll-up counts',
  })
  @ApiOkResponse({ type: OperationsSummaryResponseDto })
  summary(
    @Query() query: OperationsSummaryQueryDto,
  ): Promise<OperationsSummaryResponseDto> {
    return this.operations.summary(query.date);
  }

  // --- Daily logs ---

  @Get('daily-logs')
  @RequireAbility(Action.Read, 'Trip')
  @ApiOperation({
    summary: 'Get the daily log for a (date, truckId) — 404 if none yet',
  })
  @ApiOkResponse({ type: DailyLogDetailResponseDto })
  getLog(
    @Query() query: GetDailyLogQueryDto,
  ): Promise<DailyLogDetailResponseDto> {
    return this.operations.getLog(query.date, query.truckId);
  }

  @Post('daily-logs')
  @RequireAbility(Action.Create, 'Trip')
  @AuditEntity('DailyTruckLog')
  @ApiOperation({
    summary: 'Get-or-create the daily log for a (date, truckId)',
  })
  @ApiCreatedResponse({ type: DailyLogResponseDto })
  createLog(
    @Body() dto: CreateDailyLogDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DailyLogResponseDto> {
    return this.operations.createLog(dto, user);
  }

  @Get('daily-logs/:id')
  @RequireAbility(Action.Read, 'Trip')
  @ApiOperation({ summary: 'Get a daily log (with trips + derived totals)' })
  @ApiOkResponse({ type: DailyLogDetailResponseDto })
  getLogById(@Param('id') id: string): Promise<DailyLogDetailResponseDto> {
    return this.operations.getLogById(id);
  }

  @Patch('daily-logs/:id')
  @RequireAbility(Action.Update, 'Trip')
  @AuditEntity('DailyTruckLog')
  @ApiOperation({ summary: 'Update a daily log (fuel, odometer, notes)' })
  @ApiOkResponse({ type: DailyLogResponseDto })
  updateLog(
    @Param('id') id: string,
    @Body() dto: UpdateDailyLogDto,
  ): Promise<DailyLogResponseDto> {
    return this.operations.updateLog(id, dto);
  }

  @Patch('daily-logs/:id/confirm')
  @RequireAbility(Action.Update, 'Trip')
  @AuditEntity('DailyTruckLog')
  @ApiOperation({ summary: 'Confirm a daily log (draft → confirmed)' })
  @ApiOkResponse({ type: DailyLogResponseDto })
  confirmLog(@Param('id') id: string): Promise<DailyLogResponseDto> {
    return this.operations.confirmLog(id);
  }

  // --- Trips ---

  @Post('daily-logs/:id/trips')
  @RequireAbility(Action.Create, 'Trip')
  @ApiOperation({
    summary: 'Add a trip to a daily log (rate-prepopulated, editable)',
  })
  @ApiCreatedResponse({ type: TripResponseDto })
  createTrip(
    @Param('id') id: string,
    @Body() dto: CreateTripDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TripResponseDto> {
    return this.operations.createTrip(id, dto, user);
  }

  @Patch('trips/:id')
  @RequireAbility(Action.Update, 'Trip')
  @ApiOperation({ summary: 'Update a trip' })
  @ApiOkResponse({ type: TripResponseDto })
  updateTrip(
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
  ): Promise<TripResponseDto> {
    return this.operations.updateTrip(id, dto);
  }

  @Delete('trips/:id')
  @RequireAbility(Action.Delete, 'Trip')
  @ApiOperation({
    summary: 'Delete a trip (hard delete; ops_manager/finance/admin only)',
  })
  @ApiNoContentResponse({ description: 'Trip deleted' })
  deleteTrip(@Param('id') id: string): Promise<void> {
    return this.operations.deleteTrip(id);
  }
}
