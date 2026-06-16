import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { ListCostsQueryDto } from './dto/cost-query.dto';
import { CostResponseDto } from './dto/cost-response.dto';
import { CreateCostDto } from './dto/create-cost.dto';

@Injectable()
export class CostsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCostsQueryDto): Promise<CostResponseDto[]> {
    const date = dateFilter(query.from, query.to);
    const costs = await this.prisma.truckCost.findMany({
      where: { truckId: query.truckId, ...(date ? { date } : {}) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { truck: { select: { code: true } } },
    });
    return costs.map((c) => ({
      id: c.id,
      truckId: c.truckId,
      truckCode: c.truck.code,
      date: c.date,
      category: c.category,
      amount: c.amount.toFixed(2),
      note: c.note,
      createdAt: c.createdAt,
    }));
  }

  async create(dto: CreateCostDto, user: AuthUser): Promise<CostResponseDto> {
    const truck = await this.prisma.truck.findUnique({
      where: { id: dto.truckId },
      select: { code: true },
    });
    if (!truck) throw new BadRequestException('Unknown truck');
    const cost = await this.prisma.truckCost.create({
      data: {
        truckId: dto.truckId,
        date: toDateOnly(dto.date),
        category: dto.category,
        amount: dto.amount,
        note: dto.note,
        createdById: user.userId,
      },
    });
    return {
      id: cost.id,
      truckId: cost.truckId,
      truckCode: truck.code,
      date: cost.date,
      category: cost.category,
      amount: cost.amount.toFixed(2),
      note: cost.note,
      createdAt: cost.createdAt,
    };
  }

  async remove(id: string): Promise<void> {
    const cost = await this.prisma.truckCost.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cost) throw new NotFoundException('Cost not found');
    await this.prisma.truckCost.delete({ where: { id } });
  }
}

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
