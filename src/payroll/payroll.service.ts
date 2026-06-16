import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PayRole, PayrollRun, PayrollStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { PAYROLL_PAID, PayrollPaidEvent } from '../treasury/treasury.events';
import { CreateRunDto } from './dto/create-run.dto';
import {
  ListRunsQueryDto,
  PayrollPreviewQueryDto,
} from './dto/payroll-query.dto';
import {
  PayrollPreviewResponseDto,
  PayrollRunDetailResponseDto,
  PayrollRunResponseDto,
  WorkerStatementDto,
} from './dto/run-response.dto';
import { UpdateRunDto } from './dto/update-run.dto';

// A frozen pay line before it is persisted.
interface LineDraft {
  tripId: string;
  workerId: string;
  workerName: string;
  role: PayRole;
  date: Date;
  truckCode: string;
  amount: Prisma.Decimal;
}

const TRANSITIONS: Record<PayrollStatus, PayrollStatus[]> = {
  draft: [PayrollStatus.approved, PayrollStatus.paid, PayrollStatus.void],
  approved: [PayrollStatus.paid, PayrollStatus.void],
  paid: [],
  void: [],
};

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async preview(
    query: PayrollPreviewQueryDto,
  ): Promise<PayrollPreviewResponseDto> {
    const from = toDateOnly(query.from);
    const to = toDateOnly(query.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('`from` must be on or before `to`');
    }
    const lines = await this.fetchPayableLines(from, to);
    const workers = aggregateByWorker(lines);
    const total = lines.reduce(
      (a, l) => a.add(l.amount),
      new Prisma.Decimal(0),
    );
    return {
      from: toYmd(from),
      to: toYmd(to),
      workers,
      workerCount: workers.length,
      total: total.toFixed(2),
    };
  }

  async create(
    dto: CreateRunDto,
    user: AuthUser,
  ): Promise<PayrollRunDetailResponseDto> {
    const from = toDateOnly(dto.from);
    const to = toDateOnly(dto.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('`from` must be on or before `to`');
    }
    const run = await this.prisma.$transaction(async (tx) => {
      const lines = await this.fetchPayableLines(from, to, tx);
      if (lines.length === 0) {
        throw new BadRequestException('No payable trips in this period');
      }
      const total = lines.reduce(
        (a, l) => a.add(l.amount),
        new Prisma.Decimal(0),
      );
      const workerCount = new Set(lines.map((l) => l.workerId)).size;
      const number = await this.nextNumber(tx, todayUtc().getUTCFullYear());
      return tx.payrollRun.create({
        data: {
          number,
          periodFrom: from,
          periodTo: to,
          total,
          workerCount,
          notes: dto.notes,
          createdById: user.userId,
          lines: { create: lines },
        },
      });
    });
    return this.getDetail(run.id);
  }

  async list(query: ListRunsQueryDto): Promise<PayrollRunResponseDto[]> {
    const runs = await this.prisma.payrollRun.findMany({
      where: { status: query.status },
      orderBy: { number: 'desc' },
    });
    return runs.map((r) => this.toResponse(r));
  }

  async getDetail(id: string): Promise<PayrollRunDetailResponseDto> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!run) throw new NotFoundException('Pay run not found');
    return { ...this.toResponse(run), workers: aggregateByWorker(run.lines) };
  }

  async update(
    id: string,
    dto: UpdateRunDto,
  ): Promise<PayrollRunDetailResponseDto> {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Pay run not found');

    const data: Prisma.PayrollRunUpdateInput = {};
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.status && dto.status !== run.status) {
      if (!TRANSITIONS[run.status].includes(dto.status)) {
        throw new BadRequestException(
          `Cannot change status from ${run.status} to ${dto.status}`,
        );
      }
      data.status = dto.status;
      if (dto.status === PayrollStatus.paid) data.paidAt = new Date();
    }
    await this.prisma.payrollRun.update({ where: { id }, data });
    const detail = await this.getDetail(id);

    // Marked paid → auto-post the cash outflow to the treasury ledger.
    if (
      dto.status === PayrollStatus.paid &&
      run.status !== PayrollStatus.paid
    ) {
      const e: PayrollPaidEvent = {
        runId: detail.id,
        number: detail.number,
        total: detail.total,
        date: detail.paidAt ?? new Date(),
      };
      this.events.emit(PAYROLL_PAID, e);
    }
    return detail;
  }

  async remove(id: string): Promise<void> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!run) throw new NotFoundException('Pay run not found');
    if (run.status !== PayrollStatus.draft) {
      throw new BadRequestException(
        'Only draft runs can be deleted; void it instead',
      );
    }
    await this.prisma.payrollRun.delete({ where: { id } });
  }

  // --- helpers ---

  // Two pay lines per trip (driver + helper, when present) for trips in [from,to]
  // not already on a non-void run. Snapshots worker name + truck + date.
  private async fetchPayableLines(
    from: Date,
    to: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<LineDraft[]> {
    const covered = await tx.payrollLine.findMany({
      where: { run: { status: { not: PayrollStatus.void } } },
      select: { tripId: true },
    });
    const coveredIds = [...new Set(covered.map((l) => l.tripId))];
    const trips = await tx.trip.findMany({
      where: {
        id: { notIn: coveredIds },
        dailyLog: { date: { gte: from, lte: to } },
      },
      select: {
        id: true,
        driverPay: true,
        helperPay: true,
        driverWorkerId: true,
        driver: { select: { fullName: true } },
        helperWorkerId: true,
        helper: { select: { fullName: true } },
        dailyLog: {
          select: { date: true, truck: { select: { code: true } } },
        },
      },
      orderBy: [{ dailyLog: { date: 'asc' } }, { seq: 'asc' }],
    });

    const lines: LineDraft[] = [];
    for (const t of trips) {
      const date = t.dailyLog.date;
      const truckCode = t.dailyLog.truck.code;
      lines.push({
        tripId: t.id,
        workerId: t.driverWorkerId,
        workerName: t.driver.fullName,
        role: PayRole.driver,
        date,
        truckCode,
        amount: t.driverPay,
      });
      if (t.helperWorkerId) {
        lines.push({
          tripId: t.id,
          workerId: t.helperWorkerId,
          workerName: t.helper?.fullName ?? '',
          role: PayRole.helper,
          date,
          truckCode,
          amount: t.helperPay,
        });
      }
    }
    return lines;
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    year: number,
  ): Promise<string> {
    const prefix = `PAY-${year}-`;
    const last = await tx.payrollRun.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private toResponse(run: PayrollRun): PayrollRunResponseDto {
    return {
      id: run.id,
      number: run.number,
      periodFrom: run.periodFrom,
      periodTo: run.periodTo,
      status: run.status,
      total: run.total.toFixed(2),
      workerCount: run.workerCount,
      paidAt: run.paidAt,
      notes: run.notes,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }
}

// Group pay lines into one statement row per worker (driver + helper split).
function aggregateByWorker(
  lines: {
    workerId: string;
    workerName: string;
    role: PayRole;
    amount: Prisma.Decimal;
    tripId: string;
  }[],
): WorkerStatementDto[] {
  const zero = () => new Prisma.Decimal(0);
  const byWorker = new Map<
    string,
    {
      name: string;
      driver: Prisma.Decimal;
      helper: Prisma.Decimal;
      trips: Set<string>;
    }
  >();
  for (const l of lines) {
    const e = byWorker.get(l.workerId) ?? {
      name: l.workerName,
      driver: zero(),
      helper: zero(),
      trips: new Set<string>(),
    };
    if (l.role === PayRole.driver) e.driver = e.driver.add(l.amount);
    else e.helper = e.helper.add(l.amount);
    e.trips.add(l.tripId);
    byWorker.set(l.workerId, e);
  }
  return [...byWorker.entries()]
    .map(([workerId, v]) => ({
      workerId,
      workerName: v.name,
      driverPay: v.driver.toFixed(2),
      helperPay: v.helper.toFixed(2),
      totalPay: v.driver.add(v.helper).toFixed(2),
      tripCount: v.trips.size,
    }))
    .sort(
      (a, b) =>
        Number(b.totalPay) - Number(a.totalPay) ||
        a.workerName.localeCompare(b.workerName),
    );
}

function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
function todayUtc(): Date {
  return toDateOnly(new Date().toISOString());
}
function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}
