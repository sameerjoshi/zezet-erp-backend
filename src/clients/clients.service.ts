import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Client, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

// Plain primitive shape accepted by both Prisma create and update inputs.
interface ClientData {
  name?: string;
  code?: string;
  billingFrequency?: string;
  status?: UserStatus;
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientDto): Promise<Client> {
    try {
      return await this.prisma.client.create({
        data: { ...this.toData(dto), name: dto.name },
      });
    } catch (err) {
      this.rethrowKnown(err);
    }
  }

  list(status?: UserStatus): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: status ? { status } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    await this.ensureExists(id);
    try {
      return await this.prisma.client.update({
        where: { id },
        data: this.toData(dto),
      });
    } catch (err) {
      this.rethrowKnown(err);
    }
  }

  // Soft-delete: flip status to disabled (preserve trips/rate-card history).
  async deactivate(id: string): Promise<Client> {
    await this.ensureExists(id);
    return this.prisma.client.update({
      where: { id },
      data: { status: UserStatus.disabled },
    });
  }

  // --- helpers ---

  async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.client.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Client not found');
    }
  }

  // Undefined values are skipped by Prisma; the required `name` is supplied
  // separately by `create`.
  private toData(dto: CreateClientDto | UpdateClientDto): ClientData {
    return {
      name: dto.name,
      code: dto.code,
      billingFrequency: dto.billingFrequency,
      status: dto.status,
    };
  }

  private rethrowKnown(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new BadRequestException('A client with this code already exists');
    }
    throw err;
  }
}
