import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Invoice, InvoiceStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { INVOICE_PAID, InvoicePaidEvent } from '../treasury/treasury.events';
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

const DAY_MS = 24 * 60 * 60 * 1000;

// Allowed status transitions. paid/void are terminal.
const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: [InvoiceStatus.sent, InvoiceStatus.paid, InvoiceStatus.void],
  sent: [InvoiceStatus.paid, InvoiceStatus.void],
  paid: [],
  void: [],
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // Trips eligible to bill: this client's trips in [from, to] not already on a
  // non-void invoice line. Preview shown before the invoice is created.
  async billable(query: BillableQueryDto): Promise<BillablePreviewResponseDto> {
    const from = toDateOnly(query.from);
    const to = toDateOnly(query.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('`from` must be on or before `to`');
    }
    const trips = await this.fetchBillableTrips(query.clientId, from, to);
    const total = trips.reduce(
      (a, t) => a.add(t.billAmount),
      new Prisma.Decimal(0),
    );
    return {
      clientId: query.clientId,
      from: toYmd(from),
      to: toYmd(to),
      trips: trips.map((t) => ({
        tripId: t.id,
        date: t.date,
        truckCode: t.truckCode,
        routeLabel: t.routeLabel,
        billAmount: t.billAmount.toFixed(2),
      })),
      tripCount: trips.length,
      total: total.toFixed(2),
    };
  }

  async create(
    dto: CreateInvoiceDto,
    user: AuthUser,
  ): Promise<InvoiceDetailResponseDto> {
    const from = toDateOnly(dto.from);
    const to = toDateOnly(dto.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('`from` must be on or before `to`');
    }
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
      select: { id: true },
    });
    if (!client) throw new BadRequestException('Unknown client');

    const invoice = await this.prisma.$transaction(async (tx) => {
      const trips = await this.fetchBillableTrips(dto.clientId, from, to, tx);
      if (trips.length === 0) {
        throw new BadRequestException(
          'No billable trips for this client in this period',
        );
      }
      const total = trips.reduce(
        (a, t) => a.add(t.billAmount),
        new Prisma.Decimal(0),
      );
      const issue = todayUtc();
      const number = await this.nextNumber(tx, issue.getUTCFullYear());
      return tx.invoice.create({
        data: {
          number,
          clientId: dto.clientId,
          periodFrom: from,
          periodTo: to,
          issueDate: issue,
          total,
          notes: dto.notes,
          createdById: user.userId,
          lines: {
            create: trips.map((t) => ({
              tripId: t.id,
              date: t.date,
              truckCode: t.truckCode,
              routeLabel: t.routeLabel,
              billAmount: t.billAmount,
            })),
          },
        },
      });
    });

    return this.getDetail(invoice.id);
  }

  async list(query: ListInvoicesQueryDto): Promise<InvoiceResponseDto[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: query.status,
        clientId: query.clientId,
      },
      orderBy: { number: 'desc' },
      include: {
        client: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    });
    return invoices.map((i) =>
      this.toResponse(i, i.client.name, i._count.lines),
    );
  }

  async getDetail(id: string): Promise<InvoiceDetailResponseDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { name: true } },
        lines: { orderBy: { date: 'asc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return {
      ...this.toResponse(invoice, invoice.client.name, invoice.lines.length),
      lines: invoice.lines.map((l) => ({
        id: l.id,
        tripId: l.tripId,
        date: l.date,
        truckCode: l.truckCode,
        routeLabel: l.routeLabel,
        billAmount: l.billAmount.toFixed(2),
      })),
    };
  }

  async update(
    id: string,
    dto: UpdateInvoiceDto,
  ): Promise<InvoiceDetailResponseDto> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const data: Prisma.InvoiceUpdateInput = {};
    if (dto.notes !== undefined) data.notes = dto.notes;

    if (dto.status && dto.status !== invoice.status) {
      if (!TRANSITIONS[invoice.status].includes(dto.status)) {
        throw new BadRequestException(
          `Cannot change status from ${invoice.status} to ${dto.status}`,
        );
      }
      data.status = dto.status;
      if (dto.status === InvoiceStatus.paid) {
        data.amountPaid = invoice.total;
        data.paidAt = new Date();
      }
    }

    await this.prisma.invoice.update({ where: { id }, data });
    const detail = await this.getDetail(id);

    // Marked paid → auto-post the cash inflow to the treasury ledger.
    if (
      dto.status === InvoiceStatus.paid &&
      invoice.status !== InvoiceStatus.paid
    ) {
      const e: InvoicePaidEvent = {
        invoiceId: detail.id,
        number: detail.number,
        clientName: detail.clientName,
        total: detail.total,
        date: detail.paidAt ?? new Date(),
      };
      this.events.emit(INVOICE_PAID, e);
    }
    return detail;
  }

  // Only drafts may be deleted (cascade lines). Issued invoices are voided.
  async remove(id: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.draft) {
      throw new BadRequestException(
        'Only draft invoices can be deleted; void it instead',
      );
    }
    await this.prisma.invoice.delete({ where: { id } });
  }

  // AR aging: outstanding (sent, unpaid) invoices bucketed by age-since-issue,
  // grouped per client.
  async aging(): Promise<AgingResponseDto> {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.sent },
      include: { client: { select: { name: true } } },
    });
    const now = Date.now();
    const zero = () => new Prisma.Decimal(0);
    const byClient = new Map<
      string,
      {
        name: string;
        current: Prisma.Decimal;
        d30: Prisma.Decimal;
        d60: Prisma.Decimal;
        d90: Prisma.Decimal;
      }
    >();

    for (const inv of invoices) {
      const outstanding = inv.total.sub(inv.amountPaid);
      if (outstanding.lessThanOrEqualTo(0)) continue;
      const ageDays = Math.floor((now - inv.issueDate.getTime()) / DAY_MS);
      const e = byClient.get(inv.clientId) ?? {
        name: inv.client.name,
        current: zero(),
        d30: zero(),
        d60: zero(),
        d90: zero(),
      };
      if (ageDays <= 30) e.current = e.current.add(outstanding);
      else if (ageDays <= 60) e.d30 = e.d30.add(outstanding);
      else if (ageDays <= 90) e.d60 = e.d60.add(outstanding);
      else e.d90 = e.d90.add(outstanding);
      byClient.set(inv.clientId, e);
    }

    let grand = zero();
    const clients = [...byClient.entries()]
      .map(([clientId, v]) => {
        const total = v.current.add(v.d30).add(v.d60).add(v.d90);
        grand = grand.add(total);
        return {
          clientId,
          clientName: v.name,
          current: v.current.toFixed(2),
          d30: v.d30.toFixed(2),
          d60: v.d60.toFixed(2),
          d90: v.d90.toFixed(2),
          total: total.toFixed(2),
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));

    return { clients, grandTotal: grand.toFixed(2) };
  }

  // --- helpers ---

  // Flattened billable trips for a client in [from, to], excluding any already on
  // a non-void invoice line. `client`/`truck` joins give the snapshot fields.
  private async fetchBillableTrips(
    clientId: string,
    from: Date,
    to: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<
    {
      id: string;
      date: Date;
      truckCode: string;
      routeLabel: string | null;
      billAmount: Prisma.Decimal;
    }[]
  > {
    const invoiced = await tx.invoiceLine.findMany({
      where: { invoice: { status: { not: InvoiceStatus.void } } },
      select: { tripId: true },
    });
    const trips = await tx.trip.findMany({
      where: {
        clientId,
        id: { notIn: invoiced.map((l) => l.tripId) },
        dailyLog: { date: { gte: from, lte: to } },
      },
      select: {
        id: true,
        routeLabel: true,
        billAmount: true,
        dailyLog: {
          select: { date: true, truck: { select: { code: true } } },
        },
      },
      orderBy: [{ dailyLog: { date: 'asc' } }, { seq: 'asc' }],
    });
    return trips.map((t) => ({
      id: t.id,
      date: t.dailyLog.date,
      truckCode: t.dailyLog.truck.code,
      routeLabel: t.routeLabel,
      billAmount: t.billAmount,
    }));
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    year: number,
  ): Promise<string> {
    const prefix = `INV-${year}-`;
    const last = await tx.invoice.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private toResponse(
    inv: Invoice,
    clientName: string,
    lineCount: number,
  ): InvoiceResponseDto {
    return {
      id: inv.id,
      number: inv.number,
      clientId: inv.clientId,
      clientName,
      periodFrom: inv.periodFrom,
      periodTo: inv.periodTo,
      status: inv.status,
      issueDate: inv.issueDate,
      total: inv.total.toFixed(2),
      amountPaid: inv.amountPaid.toFixed(2),
      paidAt: inv.paidAt,
      notes: inv.notes,
      lineCount,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    };
  }
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
