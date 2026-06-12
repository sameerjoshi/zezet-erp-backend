import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Truck, TruckStatus } from '@prisma/client';
import { decimalToString } from '../common/decimal.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { TruckResponseDto } from './dto/truck-response.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';

// Plain primitive shape accepted by both Prisma create and update inputs.
// `undefined` values are skipped by Prisma, keeping PATCH partial.
interface TruckData {
  code?: string;
  plate?: string;
  year?: number;
  sizeFt?: number;
  purchaseDate?: Date;
  purchasePrice?: number;
  odometerStart?: number;
  status?: TruckStatus;
}

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTruckDto): Promise<TruckResponseDto> {
    try {
      const truck = await this.prisma.truck.create({
        data: { ...this.toData(dto), code: dto.code },
      });
      return this.toDto(truck);
    } catch (err) {
      this.rethrowKnown(err);
    }
  }

  async list(status?: TruckStatus): Promise<TruckResponseDto[]> {
    const trucks = await this.prisma.truck.findMany({
      where: status ? { status } : undefined,
      orderBy: { code: 'asc' },
    });
    return trucks.map((t) => this.toDto(t));
  }

  async get(id: string): Promise<TruckResponseDto> {
    const truck = await this.prisma.truck.findUnique({ where: { id } });
    if (!truck) {
      throw new NotFoundException('Truck not found');
    }
    return this.toDto(truck);
  }

  async update(id: string, dto: UpdateTruckDto): Promise<TruckResponseDto> {
    await this.ensureExists(id);
    try {
      const truck = await this.prisma.truck.update({
        where: { id },
        data: this.toData(dto),
      });
      return this.toDto(truck);
    } catch (err) {
      this.rethrowKnown(err);
    }
  }

  // Soft-delete: flip status to inactive (preserve the row + its log history).
  async deactivate(id: string): Promise<TruckResponseDto> {
    await this.ensureExists(id);
    const truck = await this.prisma.truck.update({
      where: { id },
      data: { status: TruckStatus.inactive },
    });
    return this.toDto(truck);
  }

  // --- helpers ---

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.truck.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Truck not found');
    }
  }

  // Map a create/update DTO to Prisma fields. `purchaseDate` arrives as an ISO
  // string and is coerced to a Date. Undefined values are left in place: Prisma
  // ignores `undefined` on both create and update, so PATCH stays partial. The
  // required `code` is supplied separately by `create`.
  private toData(dto: CreateTruckDto | UpdateTruckDto): TruckData {
    return {
      code: dto.code,
      plate: dto.plate,
      year: dto.year,
      sizeFt: dto.sizeFt,
      purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
      purchasePrice: dto.purchasePrice,
      odometerStart: dto.odometerStart,
      status: dto.status,
    };
  }

  private toDto(truck: Truck): TruckResponseDto {
    return {
      id: truck.id,
      code: truck.code,
      plate: truck.plate,
      year: truck.year,
      sizeFt: truck.sizeFt,
      purchaseDate: truck.purchaseDate,
      purchasePrice: decimalToString(truck.purchasePrice),
      odometerStart: truck.odometerStart,
      status: truck.status,
      createdAt: truck.createdAt,
      updatedAt: truck.updatedAt,
    };
  }

  private rethrowKnown(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new BadRequestException('A truck with this code already exists');
    }
    throw err;
  }
}
