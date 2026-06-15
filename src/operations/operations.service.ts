import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DailyTruckLog, LogStatus, Prisma, TruckStatus } from '@prisma/client';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { decimalToString } from '../common/decimal.util';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { DailyLogDetailResponseDto } from './dto/daily-log-detail-response.dto';
import {
  DailyLogResponseDto,
  DailyLogTotalsDto,
} from './dto/daily-log-response.dto';
import {
  OperationsSummaryResponseDto,
  TruckDaySummaryStatus,
} from './dto/operations-summary-response.dto';
import { TripResponseDto } from './dto/trip-response.dto';
import { UpdateDailyLogDto } from './dto/update-daily-log.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import {
  TRIP_CREATED_EVENT,
  TripCreatedEvent,
} from './events/trip-created.event';
import { computeLogWarnings } from './log-warnings';
import { nextSeq, resolveTripFinancials } from './trip-financials';

// Money columns are typed `Prisma.Decimal` at runtime.
type TripMoney = {
  billAmount: Prisma.Decimal;
  driverPay: Prisma.Decimal;
  helperPay: Prisma.Decimal;
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly events: EventEmitter2,
  ) {}

  // --- Daily logs ---

  // Get-or-create per (date, truckId). The unique [date, truckId] constraint is
  // the backstop: a racing/duplicate create returns the existing log rather than
  // erroring, so the frontend's "GET then POST" flow is idempotent.
  async createLog(
    dto: CreateDailyLogDto,
    user: AuthUser,
  ): Promise<DailyLogResponseDto> {
    await this.ensureTruckExists(dto.truckId);
    const date = toDateOnly(dto.date);

    let log: DailyTruckLog;
    try {
      log = await this.prisma.dailyTruckLog.create({
        data: {
          date,
          truckId: dto.truckId,
          operStatus: dto.operStatus,
          fuelCost: dto.fuelCost,
          odometerStart: dto.odometerStart,
          odometerEnd: dto.odometerEnd,
          notes: dto.notes,
          enteredById: user.userId,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        log = await this.prisma.dailyTruckLog.findUniqueOrThrow({
          where: { date_truckId: { date, truckId: dto.truckId } },
        });
      } else {
        throw err;
      }
    }

    const warnings = await this.logWarnings(log, false);
    return this.toLogResponse(log, await this.tripCount(log.id), warnings);
  }

  async getLog(
    dateInput: string,
    truckId: string,
  ): Promise<DailyLogDetailResponseDto> {
    const date = toDateOnly(dateInput);
    const log = await this.prisma.dailyTruckLog.findUnique({
      where: { date_truckId: { date, truckId } },
    });
    if (!log) {
      throw new NotFoundException('No daily log for this date and truck');
    }
    return this.toLogDetail(log);
  }

  async getLogById(id: string): Promise<DailyLogDetailResponseDto> {
    const log = await this.findLogOrThrow(id);
    return this.toLogDetail(log);
  }

  // PATCH a log's mutable fields. Odometer warnings recompute and are returned;
  // the save still happens (warnings never block).
  async updateLog(
    id: string,
    dto: UpdateDailyLogDto,
  ): Promise<DailyLogResponseDto> {
    await this.findLogOrThrow(id);
    const log = await this.prisma.dailyTruckLog.update({
      where: { id },
      data: {
        operStatus: dto.operStatus,
        fuelCost: dto.fuelCost,
        odometerStart: dto.odometerStart,
        odometerEnd: dto.odometerEnd,
        notes: dto.notes,
      },
    });
    const warnings = await this.logWarnings(log, false);
    return this.toLogResponse(log, await this.tripCount(id), warnings);
  }

  // Confirm a draft log. Warns (but does not block) when there are no trips.
  async confirmLog(id: string): Promise<DailyLogResponseDto> {
    const existing = await this.findLogOrThrow(id);
    if (existing.status === LogStatus.confirmed) {
      throw new BadRequestException('Daily log is already confirmed');
    }
    const log = await this.prisma.dailyTruckLog.update({
      where: { id },
      data: { status: LogStatus.confirmed },
    });
    const count = await this.tripCount(id);
    const warnings = await this.logWarnings(log, true, count);
    return this.toLogResponse(log, count, warnings);
  }

  // --- Trips ---

  // Create a trip under a log. On missing rateId the effective rate is resolved
  // (clientId + routeLabel) and prepopulates the money fields; any money field
  // in the DTO overrides it. seq auto-increments within the log. Emits
  // `trip.created` for downstream Billing/Payroll.
  async createTrip(
    logId: string,
    dto: CreateTripDto,
    user: AuthUser,
  ): Promise<TripResponseDto> {
    const log = await this.findLogOrThrow(logId);
    await this.ensureClientExists(dto.clientId);
    await this.ensureWorkerExists(dto.driverWorkerId, 'Driver');
    if (dto.helperWorkerId !== undefined) {
      await this.ensureWorkerExists(dto.helperWorkerId, 'Helper');
    }

    // Resolve the rate that prepopulates the trip: explicit rateId wins,
    // otherwise the effective rate for the client + route.
    const rate = dto.rateId
      ? await this.findRateOrThrow(dto.rateId)
      : await this.pricing.findEffectiveRate(dto.clientId, dto.routeLabel);

    const money = resolveTripFinancials(
      {
        billAmount: dto.billAmount,
        driverPay: dto.driverPay,
        helperPay: dto.helperPay,
        rateId: dto.rateId,
      },
      rate
        ? {
            id: rate.id,
            clientPrice: rate.clientPrice.toNumber(),
            driverPay: rate.driverPay.toNumber(),
            helperPay: rate.helperPay.toNumber(),
          }
        : null,
    );

    // seq is derived inside a transaction to avoid two concurrent creates
    // landing on the same number.
    const trip = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.trip.findMany({
        where: { dailyLogId: logId },
        select: { seq: true },
      });
      return tx.trip.create({
        data: {
          dailyLogId: logId,
          seq: nextSeq(existing.map((t) => t.seq)),
          clientId: dto.clientId,
          routeLabel: dto.routeLabel,
          billAmount: money.billAmount,
          driverWorkerId: dto.driverWorkerId,
          helperWorkerId: dto.helperWorkerId,
          driverPay: money.driverPay,
          helperPay: money.helperPay,
          rateId: money.rateId,
          createdById: user.userId,
        },
      });
    });

    const payload: TripCreatedEvent = {
      tripId: trip.id,
      dailyLogId: trip.dailyLogId,
      truckId: log.truckId,
      clientId: trip.clientId,
      date: log.date,
      seq: trip.seq,
      routeLabel: trip.routeLabel,
      driverWorkerId: trip.driverWorkerId,
      helperWorkerId: trip.helperWorkerId,
      billAmount: decimalToString(trip.billAmount) ?? '0.00',
      driverPay: decimalToString(trip.driverPay) ?? '0.00',
      helperPay: decimalToString(trip.helperPay) ?? '0.00',
      rateId: trip.rateId,
      createdById: trip.createdById,
      createdAt: trip.createdAt,
    };
    this.events.emit(TRIP_CREATED_EVENT, payload);

    return this.toTripDto(trip);
  }

  // PATCH a trip. Does NOT re-run rate prepopulation — applies exactly what is
  // supplied. Referential integrity is validated for any id being changed.
  async updateTrip(id: string, dto: UpdateTripDto): Promise<TripResponseDto> {
    await this.findTripOrThrow(id);
    if (dto.clientId !== undefined) {
      await this.ensureClientExists(dto.clientId);
    }
    if (dto.driverWorkerId !== undefined) {
      await this.ensureWorkerExists(dto.driverWorkerId, 'Driver');
    }
    if (dto.helperWorkerId !== undefined) {
      await this.ensureWorkerExists(dto.helperWorkerId, 'Helper');
    }
    if (dto.rateId !== undefined) {
      await this.findRateOrThrow(dto.rateId);
    }

    const trip = await this.prisma.trip.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        routeLabel: dto.routeLabel,
        billAmount: dto.billAmount,
        driverWorkerId: dto.driverWorkerId,
        helperWorkerId: dto.helperWorkerId,
        driverPay: dto.driverPay,
        helperPay: dto.helperPay,
        rateId: dto.rateId,
      },
    });
    return this.toTripDto(trip);
  }

  // Hard delete — trips are line items, not master data, so removing a mistaken
  // entry is fine. (The parent log + its history are preserved.)
  async deleteTrip(id: string): Promise<void> {
    await this.findTripOrThrow(id);
    await this.prisma.trip.delete({ where: { id } });
  }

  // --- Dashboard summary ---

  // Per-truck log status for a date + fleet roll-up counts. Considers active
  // trucks only.
  async summary(dateInput: string): Promise<OperationsSummaryResponseDto> {
    const date = toDateOnly(dateInput);
    const trucks = await this.prisma.truck.findMany({
      where: { status: TruckStatus.active },
      orderBy: { code: 'asc' },
      select: { id: true, code: true },
    });
    const logs = await this.prisma.dailyTruckLog.findMany({
      where: { date, truckId: { in: trucks.map((t) => t.id) } },
      select: {
        id: true,
        truckId: true,
        status: true,
        operStatus: true,
        _count: { select: { trips: true } },
      },
    });
    const byTruck = new Map(logs.map((l) => [l.truckId, l]));

    const counts = { trucks: trucks.length, none: 0, draft: 0, confirmed: 0 };
    const rows = trucks.map((truck) => {
      const log = byTruck.get(truck.id);
      const status: TruckDaySummaryStatus = log ? log.status : 'none';
      counts[status] += 1;
      return {
        truckId: truck.id,
        truckCode: truck.code,
        status,
        operStatus: log?.operStatus ?? null,
        logId: log?.id ?? null,
        tripCount: log?._count.trips ?? 0,
      };
    });

    return { date, trucks: rows, counts };
  }

  // --- helpers ---

  private async findLogOrThrow(id: string): Promise<DailyTruckLog> {
    const log = await this.prisma.dailyTruckLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException('Daily log not found');
    }
    return log;
  }

  private async findTripOrThrow(id: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
  }

  private async findRateOrThrow(id: string) {
    const rate = await this.prisma.rate.findUnique({ where: { id } });
    if (!rate) {
      throw new BadRequestException('Unknown rate');
    }
    return rate;
  }

  private async ensureTruckExists(id: string): Promise<void> {
    const truck = await this.prisma.truck.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!truck) {
      throw new BadRequestException('Unknown truck');
    }
  }

  private async ensureClientExists(id: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!client) {
      throw new BadRequestException('Unknown client');
    }
  }

  private async ensureWorkerExists(id: string, role: string): Promise<void> {
    const worker = await this.prisma.worker.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!worker) {
      throw new BadRequestException(`Unknown ${role.toLowerCase()} worker`);
    }
  }

  private async tripCount(logId: string): Promise<number> {
    return this.prisma.trip.count({ where: { dailyLogId: logId } });
  }

  // Resolve odometer/empty-confirm warnings for a log, fetching the previous
  // log's odometerEnd for the same truck.
  private async logWarnings(
    log: DailyTruckLog,
    confirming: boolean,
    tripCount?: number,
  ): Promise<string[]> {
    const previous = await this.prisma.dailyTruckLog.findFirst({
      where: {
        truckId: log.truckId,
        date: { lt: log.date },
        odometerEnd: { not: null },
      },
      orderBy: { date: 'desc' },
      select: { odometerEnd: true },
    });
    return computeLogWarnings({
      odometerStart: log.odometerStart,
      odometerEnd: log.odometerEnd,
      previousOdometerEnd: previous?.odometerEnd ?? null,
      tripCount,
      confirming,
    });
  }

  private async toLogDetail(
    log: DailyTruckLog,
  ): Promise<DailyLogDetailResponseDto> {
    const trips = await this.prisma.trip.findMany({
      where: { dailyLogId: log.id },
      orderBy: { seq: 'asc' },
    });
    const warnings = await this.logWarnings(log, false, trips.length);
    return {
      ...this.toLogResponse(log, trips.length, warnings, trips),
      trips: trips.map((t) => this.toTripDto(t)),
    };
  }

  private toLogResponse(
    log: DailyTruckLog,
    tripCount: number,
    warnings: string[],
    tripsForTotals?: TripMoney[],
  ): DailyLogResponseDto {
    return {
      id: log.id,
      date: log.date,
      truckId: log.truckId,
      operStatus: log.operStatus,
      fuelCost: decimalToString(log.fuelCost),
      odometerStart: log.odometerStart,
      odometerEnd: log.odometerEnd,
      notes: log.notes,
      status: log.status,
      enteredById: log.enteredById,
      tripCount,
      totals: this.computeTotals(tripsForTotals ?? []),
      warnings,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt,
    };
  }

  private computeTotals(trips: TripMoney[]): DailyLogTotalsDto {
    const zero = new Prisma.Decimal(0);
    const bill = trips.reduce((a, t) => a.add(t.billAmount), zero);
    const driver = trips.reduce((a, t) => a.add(t.driverPay), zero);
    const helper = trips.reduce((a, t) => a.add(t.helperPay), zero);
    return {
      billAmount: bill.toFixed(2),
      driverPay: driver.toFixed(2),
      helperPay: helper.toFixed(2),
    };
  }

  private toTripDto(trip: {
    id: string;
    dailyLogId: string;
    seq: number;
    clientId: string;
    routeLabel: string | null;
    billAmount: Prisma.Decimal;
    driverWorkerId: string;
    helperWorkerId: string | null;
    driverPay: Prisma.Decimal;
    helperPay: Prisma.Decimal;
    rateId: string | null;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): TripResponseDto {
    return {
      id: trip.id,
      dailyLogId: trip.dailyLogId,
      seq: trip.seq,
      clientId: trip.clientId,
      routeLabel: trip.routeLabel,
      billAmount: decimalToString(trip.billAmount) ?? '0.00',
      driverWorkerId: trip.driverWorkerId,
      helperWorkerId: trip.helperWorkerId,
      driverPay: decimalToString(trip.driverPay) ?? '0.00',
      helperPay: decimalToString(trip.helperPay) ?? '0.00',
      rateId: trip.rateId,
      createdById: trip.createdById,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    };
  }
}

// Normalize an ISO date(-time) string to UTC midnight so it deterministically
// matches a Postgres `@db.Date` column (which carries no time/zone).
function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
