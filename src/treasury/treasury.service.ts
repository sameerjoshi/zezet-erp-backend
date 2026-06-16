import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CostCategory,
  Prisma,
  TxCategory,
  TxDirection,
  TxSource,
  UserStatus,
} from '@prisma/client';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountResponseDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/account.dto';
import { CashPositionResponseDto } from './dto/cash-position-response.dto';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  TransactionResponseDto,
} from './dto/transaction.dto';
import { COST_CREATED, INVOICE_PAID, PAYROLL_PAID } from './treasury.events';
import type {
  CostCreatedEvent,
  InvoicePaidEvent,
  PayrollPaidEvent,
} from './treasury.events';

@Injectable()
export class TreasuryService {
  private readonly logger = new Logger(TreasuryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- accounts ---

  async listAccounts(): Promise<AccountResponseDto[]> {
    const [accounts, net] = await Promise.all([
      this.prisma.bankAccount.findMany({ orderBy: { name: 'asc' } }),
      this.netByAccount(),
    ]);
    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      openingBalance: a.openingBalance.toFixed(2),
      balance: a.openingBalance
        .add(net.get(a.id) ?? new Prisma.Decimal(0))
        .toFixed(2),
      isDefault: a.isDefault,
      status: a.status,
      createdAt: a.createdAt,
    }));
  }

  async createAccount(dto: CreateAccountDto): Promise<AccountResponseDto> {
    // The first account becomes the auto-post default.
    const existing = await this.prisma.bankAccount.count();
    const a = await this.prisma.bankAccount.create({
      data: {
        name: dto.name,
        kind: dto.kind,
        openingBalance: dto.openingBalance,
        isDefault: existing === 0,
      },
    });
    return this.toAccount(a, new Prisma.Decimal(0));
  }

  async updateAccount(
    id: string,
    dto: UpdateAccountDto,
  ): Promise<AccountResponseDto> {
    await this.ensureAccount(id);
    // Only one default — promoting this one demotes the rest.
    if (dto.isDefault === true) {
      await this.prisma.bankAccount.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    const a = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        name: dto.name,
        kind: dto.kind,
        openingBalance: dto.openingBalance,
        isDefault: dto.isDefault,
        status: dto.status,
      },
    });
    const net = await this.netByAccount(id);
    return this.toAccount(a, net.get(id) ?? new Prisma.Decimal(0));
  }

  // Hard delete only when empty (preserves ledger history); otherwise deactivate.
  async removeAccount(id: string): Promise<void> {
    await this.ensureAccount(id);
    const count = await this.prisma.transaction.count({
      where: { accountId: id },
    });
    if (count > 0) {
      throw new BadRequestException(
        'Account has transactions; deactivate it instead',
      );
    }
    await this.prisma.bankAccount.delete({ where: { id } });
  }

  // --- transactions ---

  async listTransactions(
    query: ListTransactionsQueryDto,
  ): Promise<TransactionResponseDto[]> {
    const date = dateFilter(query.from, query.to);
    const txns = await this.prisma.transaction.findMany({
      where: {
        accountId: query.accountId,
        category: query.category,
        ...(date ? { date } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { account: { select: { name: true } } },
    });
    const codeById = await this.truckCodes(
      txns.map((t) => t.truckId).filter((x): x is string => !!x),
    );
    return txns.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      accountName: t.account.name,
      date: t.date,
      direction: t.direction,
      amount: t.amount.toFixed(2),
      category: t.category,
      description: t.description,
      truckId: t.truckId,
      truckCode: t.truckId ? (codeById.get(t.truckId) ?? null) : null,
      note: t.note,
      sourceType: t.sourceType,
      createdAt: t.createdAt,
    }));
  }

  async createTransaction(
    dto: CreateTransactionDto,
    user: AuthUser,
  ): Promise<TransactionResponseDto> {
    await this.ensureAccount(dto.accountId);
    if (dto.truckId) {
      const truck = await this.prisma.truck.findUnique({
        where: { id: dto.truckId },
        select: { id: true },
      });
      if (!truck) throw new BadRequestException('Unknown truck');
    }
    const t = await this.prisma.transaction.create({
      data: {
        accountId: dto.accountId,
        date: toDateOnly(dto.date),
        direction: dto.direction,
        amount: dto.amount,
        category: dto.category,
        description: dto.description,
        truckId: dto.truckId,
        note: dto.note,
        createdById: user.userId,
      },
      include: { account: { select: { name: true } } },
    });
    const codeById = await this.truckCodes(t.truckId ? [t.truckId] : []);
    return {
      id: t.id,
      accountId: t.accountId,
      accountName: t.account.name,
      date: t.date,
      direction: t.direction,
      amount: t.amount.toFixed(2),
      category: t.category,
      description: t.description,
      truckId: t.truckId,
      truckCode: t.truckId ? (codeById.get(t.truckId) ?? null) : null,
      note: t.note,
      sourceType: t.sourceType,
      createdAt: t.createdAt,
    };
  }

  async removeTransaction(id: string): Promise<void> {
    const t = await this.prisma.transaction.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!t) throw new NotFoundException('Transaction not found');
    await this.prisma.transaction.delete({ where: { id } });
  }

  // --- cash position ---

  async cashPosition(): Promise<CashPositionResponseDto> {
    const [accounts, net] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where: { status: UserStatus.active },
        orderBy: { name: 'asc' },
      }),
      this.netByAccount(),
    ]);
    let total = new Prisma.Decimal(0);
    const rows = accounts.map((a) => {
      const bal = a.openingBalance.add(net.get(a.id) ?? new Prisma.Decimal(0));
      total = total.add(bal);
      return { accountId: a.id, name: a.name, balance: bal.toFixed(2) };
    });
    return { accounts: rows, total: total.toFixed(2) };
  }

  // --- helpers ---

  // Net movement (inflows − outflows) per account, optionally for one account.
  private async netByAccount(
    accountId?: string,
  ): Promise<Map<string, Prisma.Decimal>> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['accountId', 'direction'],
      where: accountId ? { accountId } : undefined,
      _sum: { amount: true },
    });
    const net = new Map<string, Prisma.Decimal>();
    for (const g of grouped) {
      const amt = g._sum.amount ?? new Prisma.Decimal(0);
      const cur = net.get(g.accountId) ?? new Prisma.Decimal(0);
      net.set(
        g.accountId,
        g.direction === TxDirection.inflow ? cur.add(amt) : cur.sub(amt),
      );
    }
    return net;
  }

  private async truckCodes(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const trucks = await this.prisma.truck.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, code: true },
    });
    return new Map(trucks.map((t) => [t.id, t.code]));
  }

  private async ensureAccount(id: string): Promise<void> {
    const a = await this.prisma.bankAccount.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!a) throw new NotFoundException('Account not found');
  }

  private toAccount(
    a: {
      id: string;
      name: string;
      kind: AccountResponseDto['kind'];
      openingBalance: Prisma.Decimal;
      isDefault: boolean;
      status: UserStatus;
      createdAt: Date;
    },
    net: Prisma.Decimal,
  ): AccountResponseDto {
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      openingBalance: a.openingBalance.toFixed(2),
      balance: a.openingBalance.add(net).toFixed(2),
      isDefault: a.isDefault,
      status: a.status,
      createdAt: a.createdAt,
    };
  }

  // --- auto-posting (event-driven) ---

  // Post a ledger entry for a domain event. Idempotent on (sourceType, sourceId)
  // and a no-op when no account exists. Best-effort: failures are logged, not
  // thrown, so a paid invoice/run is never blocked by a treasury hiccup.
  private async autoPost(input: {
    direction: TxDirection;
    amount: string;
    category: TxCategory;
    description: string;
    date: Date;
    truckId?: string;
    sourceType: TxSource;
    sourceId: string;
  }): Promise<void> {
    try {
      const dupe = await this.prisma.transaction.findFirst({
        where: { sourceType: input.sourceType, sourceId: input.sourceId },
        select: { id: true },
      });
      if (dupe) return;
      const accountId = await this.defaultAccountId();
      if (!accountId) {
        this.logger.warn(
          `auto-post skipped (${input.sourceType} ${input.sourceId}): no treasury account`,
        );
        return;
      }
      await this.prisma.transaction.create({
        data: {
          accountId,
          date: input.date,
          direction: input.direction,
          amount: input.amount,
          category: input.category,
          description: input.description,
          truckId: input.truckId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      });
    } catch (err) {
      this.logger.error(`auto-post failed (${input.sourceType})`, err as Error);
    }
  }

  private async defaultAccountId(): Promise<string | null> {
    const def = await this.prisma.bankAccount.findFirst({
      where: { isDefault: true, status: UserStatus.active },
      select: { id: true },
    });
    if (def) return def.id;
    const first = await this.prisma.bankAccount.findFirst({
      where: { status: UserStatus.active },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return first?.id ?? null;
  }

  @OnEvent(INVOICE_PAID)
  async onInvoicePaid(e: InvoicePaidEvent): Promise<void> {
    await this.autoPost({
      direction: TxDirection.inflow,
      amount: e.total,
      category: TxCategory.client_payment,
      description: `${e.number} · ${e.clientName}`,
      date: e.date,
      sourceType: TxSource.invoice,
      sourceId: e.invoiceId,
    });
  }

  @OnEvent(PAYROLL_PAID)
  async onPayrollPaid(e: PayrollPaidEvent): Promise<void> {
    await this.autoPost({
      direction: TxDirection.outflow,
      amount: e.total,
      category: TxCategory.salary,
      description: e.number,
      date: e.date,
      sourceType: TxSource.payroll,
      sourceId: e.runId,
    });
  }

  @OnEvent(COST_CREATED)
  async onCostCreated(e: CostCreatedEvent): Promise<void> {
    await this.autoPost({
      direction: TxDirection.outflow,
      amount: e.amount,
      category: COST_TO_TX[e.category as CostCategory] ?? TxCategory.other,
      description: `${e.truckCode}${e.note ? ` · ${e.note}` : ''}`,
      date: e.date,
      truckId: e.truckId,
      sourceType: TxSource.cost,
      sourceId: e.costId,
    });
  }
}

// CostCategory → TxCategory (repair folds into maintenance; rest map 1:1).
const COST_TO_TX: Record<CostCategory, TxCategory> = {
  maintenance: TxCategory.maintenance,
  toll: TxCategory.toll,
  insurance: TxCategory.insurance,
  tax: TxCategory.tax,
  repair: TxCategory.maintenance,
  other: TxCategory.other,
};

function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dateFilter(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDateOnly(from) } : {}),
    ...(to ? { lte: toDateOnly(to) } : {}),
  };
}
