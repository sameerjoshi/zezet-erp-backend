import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TruckStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClientBillablesReportResponseDto } from './dto/client-billables-report-response.dto';
import { OperationalReportResponseDto } from './dto/operational-report-response.dto';
import { ReportRangeQueryDto } from './dto/report-range-query.dto';
import { TripsReportResponseDto } from './dto/trips-report-response.dto';
import { TruckPnlResponseDto } from './dto/truck-pnl-response.dto';
import { UtilizationReportResponseDto } from './dto/utilization-report-response.dto';
import { WorkerPayReportResponseDto } from './dto/worker-pay-report-response.dto';
import {
  aggregateClientBillables,
  aggregateOperational,
  aggregateTrips,
  aggregateTruckPnl,
  aggregateUtilization,
  aggregateWorkerPay,
  OperationalRow,
  ReportTripRow,
} from './reporting.aggregate';

// Largest window we will materialize in one request — guards against an
// accidental decade-wide range enumerating thousands of days.
const MAX_RANGE_DAYS = 366;
// Default trailing window when bounds are omitted (30 days inclusive).
const DEFAULT_WINDOW_DAYS = 30;

interface ResolvedRange {
  from: Date; // UTC midnight
  to: Date; // UTC midnight
  fromYmd: string;
  toYmd: string;
}

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async trips(query: ReportRangeQueryDto): Promise<TripsReportResponseDto> {
    const range = this.resolveRange(query);
    const rows = await this.fetchTripRows(range);
    const { perDay, perTruck } = aggregateTrips(rows);
    return {
      from: range.fromYmd,
      to: range.toYmd,
      totalTrips: rows.length,
      perDay,
      perTruck,
    };
  }

  async utilization(
    query: ReportRangeQueryDto,
  ): Promise<UtilizationReportResponseDto> {
    const range = this.resolveRange(query);
    const [rows, activeTrucks] = await Promise.all([
      this.fetchTripRows(range),
      this.prisma.truck.count({ where: { status: TruckStatus.active } }),
    ]);
    const days = enumerateDays(range.from, range.to);
    return {
      from: range.fromYmd,
      to: range.toYmd,
      perDay: aggregateUtilization(rows, days, activeTrucks),
    };
  }

  async workerPay(
    query: ReportRangeQueryDto,
  ): Promise<WorkerPayReportResponseDto> {
    const range = this.resolveRange(query);
    const rows = await this.fetchTripRows(range);
    return {
      from: range.fromYmd,
      to: range.toYmd,
      workers: aggregateWorkerPay(rows),
    };
  }

  async clientBillables(
    query: ReportRangeQueryDto,
  ): Promise<ClientBillablesReportResponseDto> {
    const range = this.resolveRange(query);
    const rows = await this.fetchTripRows(range);
    return {
      from: range.fromYmd,
      to: range.toYmd,
      clients: aggregateClientBillables(rows),
    };
  }

  async operational(
    query: ReportRangeQueryDto,
  ): Promise<OperationalReportResponseDto> {
    const range = this.resolveRange(query);
    const rows = await this.fetchOperationalRows(range);
    const days = enumerateDays(range.from, range.to);
    const { totals, perDay } = aggregateOperational(rows, days);
    return { from: range.fromYmd, to: range.toYmd, totals, perDay };
  }

  async truckPnl(query: ReportRangeQueryDto): Promise<TruckPnlResponseDto> {
    const range = this.resolveRange(query);
    const [rows, logs, costs, trucks] = await Promise.all([
      this.fetchTripRows(range),
      this.prisma.dailyTruckLog.findMany({
        where: {
          date: { gte: range.from, lte: range.to },
          fuelCost: { not: null },
        },
        select: { truckId: true, fuelCost: true },
      }),
      this.prisma.truckCost.findMany({
        where: { date: { gte: range.from, lte: range.to } },
        select: { truckId: true, amount: true },
      }),
      this.prisma.truck.findMany({ select: { id: true, code: true } }),
    ]);

    const fuelByTruck = sumByTruck(logs.map((l) => [l.truckId, l.fuelCost!]));
    const costByTruck = sumByTruck(costs.map((c) => [c.truckId, c.amount]));
    const codeById = new Map(trucks.map((t) => [t.id, t.code]));
    const { perTruck, totals } = aggregateTruckPnl(
      rows.map((r) => ({
        truckId: r.truckId,
        truckCode: r.truckCode,
        billAmount: r.billAmount,
        driverPay: r.driverPay,
        helperPay: r.helperPay,
      })),
      fuelByTruck,
      costByTruck,
      codeById,
    );
    return { from: range.fromYmd, to: range.toYmd, perTruck, totals };
  }

  // --- helpers ---

  // Recorded daily logs in the range (operStatus set). Logs with a null status
  // are excluded so unrecorded/not-expected days never count against the %.
  private async fetchOperationalRows(
    range: ResolvedRange,
  ): Promise<OperationalRow[]> {
    const logs = await this.prisma.dailyTruckLog.findMany({
      where: {
        date: { gte: range.from, lte: range.to },
        operStatus: { not: null },
      },
      select: { date: true, operStatus: true },
    });
    return logs.map((l) => ({
      date: toYmd(l.date),
      operStatus: l.operStatus!,
    }));
  }

  // Pull every trip in the range flattened with the reference data the reports
  // need. Trips are dated through their parent DailyTruckLog.
  private async fetchTripRows(range: ResolvedRange): Promise<ReportTripRow[]> {
    const trips = await this.prisma.trip.findMany({
      where: { dailyLog: { date: { gte: range.from, lte: range.to } } },
      select: {
        billAmount: true,
        driverPay: true,
        helperPay: true,
        clientId: true,
        client: { select: { name: true } },
        driverWorkerId: true,
        driver: { select: { fullName: true } },
        helperWorkerId: true,
        helper: { select: { fullName: true } },
        dailyLog: {
          select: {
            date: true,
            truckId: true,
            truck: { select: { code: true } },
          },
        },
      },
    });

    return trips.map((t) => ({
      date: toYmd(t.dailyLog.date),
      truckId: t.dailyLog.truckId,
      truckCode: t.dailyLog.truck.code,
      clientId: t.clientId,
      clientName: t.client.name,
      driverWorkerId: t.driverWorkerId,
      driverWorkerName: t.driver.fullName,
      helperWorkerId: t.helperWorkerId,
      helperWorkerName: t.helper?.fullName ?? null,
      billAmount: t.billAmount,
      driverPay: t.driverPay,
      helperPay: t.helperPay,
    }));
  }

  // Resolve + validate the inclusive [from, to] window. Defaults to a trailing
  // 30-day window; rejects an inverted or excessively wide range.
  private resolveRange(query: ReportRangeQueryDto): ResolvedRange {
    const to = query.to ? toDateOnly(query.to) : todayUtc();
    const from = query.from
      ? toDateOnly(query.from)
      : addDays(to, -(DEFAULT_WINDOW_DAYS - 1));

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('`from` must be on or before `to`');
    }
    const span = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (span > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range too large (max ${MAX_RANGE_DAYS} days)`,
      );
    }

    return { from, to, fromYmd: toYmd(from), toYmd: toYmd(to) };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Sum Decimal amounts per truck id into a Map.
function sumByTruck(
  pairs: [string, Prisma.Decimal][],
): Map<string, Prisma.Decimal> {
  const m = new Map<string, Prisma.Decimal>();
  for (const [id, amt] of pairs) {
    m.set(id, (m.get(id) ?? new Prisma.Decimal(0)).add(amt));
  }
  return m;
}

// Normalize an ISO date(-time) string to UTC midnight so it deterministically
// matches a Postgres `@db.Date` column (mirrors OperationsService.toDateOnly).
function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function todayUtc(): Date {
  return toDateOnly(new Date().toISOString());
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Inclusive list of YYYY-MM-DD strings from `from` to `to` (both UTC midnight).
function enumerateDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  for (let d = from.getTime(); d <= to.getTime(); d += DAY_MS) {
    days.push(toYmd(new Date(d)));
  }
  return days;
}
