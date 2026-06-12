import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus, Worker, WorkerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { ListWorkersQueryDto } from './dto/list-workers-query.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkerResponseDto } from './dto/worker-response.dto';

// Plain primitive shape accepted by both Prisma create and update inputs.
interface WorkerData {
  fullName?: string;
  type?: WorkerType;
  canDrive?: boolean;
  canHelp?: boolean;
  status?: UserStatus;
  userId?: string;
}

@Injectable()
export class WorkforceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWorkerDto): Promise<WorkerResponseDto> {
    if (dto.userId) {
      await this.ensureUserExists(dto.userId);
    }
    try {
      const worker = await this.prisma.worker.create({
        data: { ...this.toData(dto), fullName: dto.fullName },
      });
      return this.toDto(worker);
    } catch (err) {
      this.rethrowKnown(err);
    }
  }

  async list(query: ListWorkersQueryDto): Promise<WorkerResponseDto[]> {
    const workers = await this.prisma.worker.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: { fullName: 'asc' },
    });
    return workers.map((w) => this.toDto(w));
  }

  async get(id: string): Promise<WorkerResponseDto> {
    const worker = await this.prisma.worker.findUnique({ where: { id } });
    if (!worker) {
      throw new NotFoundException('Worker not found');
    }
    return this.toDto(worker);
  }

  async update(id: string, dto: UpdateWorkerDto): Promise<WorkerResponseDto> {
    await this.ensureExists(id);
    if (dto.userId) {
      await this.ensureUserExists(dto.userId);
    }
    try {
      const worker = await this.prisma.worker.update({
        where: { id },
        data: this.toData(dto),
      });
      return this.toDto(worker);
    } catch (err) {
      this.rethrowKnown(err);
    }
  }

  // Soft-delete: flip status to disabled (preserve trip history references).
  async deactivate(id: string): Promise<WorkerResponseDto> {
    await this.ensureExists(id);
    const worker = await this.prisma.worker.update({
      where: { id },
      data: { status: UserStatus.disabled },
    });
    return this.toDto(worker);
  }

  // --- helpers ---

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.worker.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Worker not found');
    }
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Linked user does not exist');
    }
  }

  // Undefined values are skipped by Prisma; the required `fullName` is supplied
  // separately by `create`.
  private toData(dto: CreateWorkerDto | UpdateWorkerDto): WorkerData {
    return {
      fullName: dto.fullName,
      type: dto.type,
      canDrive: dto.canDrive,
      canHelp: dto.canHelp,
      status: dto.status,
      userId: dto.userId,
    };
  }

  private toDto(worker: Worker): WorkerResponseDto {
    return {
      id: worker.id,
      fullName: worker.fullName,
      type: worker.type,
      canDrive: worker.canDrive,
      canHelp: worker.canHelp,
      status: worker.status,
      userId: worker.userId,
      createdAt: worker.createdAt,
      updatedAt: worker.updatedAt,
    };
  }

  private rethrowKnown(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // userId is the only unique column on Worker.
      throw new BadRequestException(
        'That user is already linked to another worker',
      );
    }
    throw err;
  }
}
