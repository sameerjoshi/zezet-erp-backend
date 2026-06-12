import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleKey } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { RoleResponseDto, UserResponseDto } from './dto/user-response.dto';
import { baseUsername, firstFreeUsername } from './username.util';

// User loaded with its roles — the only projection these endpoints return.
type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const roleIds = await this.resolveRoleIds(dto.roles);
    const passwordHash = await argon2.hash(dto.password);

    // Retry on the unlikely username race (two creates picking the same handle
    // between our read and write). P2002 = unique-constraint violation.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const username = await this.generateUsername(dto.fullName);
      try {
        const user = await this.prisma.user.create({
          data: {
            username,
            email: dto.email,
            phone: dto.phone,
            passwordHash,
            locale: dto.locale ?? 'en',
            roles: { create: roleIds.map((roleId) => ({ roleId })) },
          },
          include: { roles: { include: { role: true } } },
        });
        return this.toDto(user);
      } catch (err) {
        if (isUniqueViolation(err, 'username') && attempt < 4) {
          continue;
        }
        if (isUniqueViolation(err, 'email')) {
          throw new BadRequestException('Email is already in use');
        }
        throw err;
      }
    }
    // Exhausted retries — extraordinarily unlikely.
    throw new BadRequestException('Could not allocate a unique username');
  }

  async list(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => this.toDto(u));
  }

  // Replaces the user's roles with exactly `roles`. Idempotent.
  async setRoles(userId: string, roles: RoleKey[]): Promise<UserResponseDto> {
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) {
      throw new NotFoundException('User not found');
    }
    const roleIds = await this.resolveRoleIds(roles);

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId })),
      });
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { roles: { include: { role: true } } },
      });
    });
    return this.toDto(user);
  }

  async listRoles(): Promise<RoleResponseDto[]> {
    const roles = await this.prisma.role.findMany({ orderBy: { key: 'asc' } });
    return roles.map((r) => ({ id: r.id, key: r.key, name: r.name }));
  }

  // --- helpers ---

  // Map role keys → ids, rejecting any unknown key (the enum guards the type,
  // but a key with no seeded Role row is a real, reportable error).
  private async resolveRoleIds(roles: RoleKey[]): Promise<string[]> {
    const unique = Array.from(new Set(roles));
    const rows = await this.prisma.role.findMany({
      where: { key: { in: unique } },
    });
    if (rows.length !== unique.length) {
      const found = new Set(rows.map((r) => r.key));
      const missing = unique.filter((k) => !found.has(k));
      throw new BadRequestException(`Unknown role(s): ${missing.join(', ')}`);
    }
    return rows.map((r) => r.id);
  }

  // Compute a collision-free username from the name, checking existing handles
  // that share the base (exact base or base+number).
  private async generateUsername(fullName: string): Promise<string> {
    const base = baseUsername(fullName) || 'user';
    const existing = await this.prisma.user.findMany({
      where: { username: { startsWith: base } },
      select: { username: true },
    });
    const taken = new Set(existing.map((u) => u.username));
    return firstFreeUsername(base, taken);
  }

  private toDto(user: UserWithRoles): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      locale: user.locale,
      status: user.status,
      roles: user.roles.map((ur) => ur.role.key),
      createdAt: user.createdAt,
    };
  }
}

function isUniqueViolation(err: unknown, field: string): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    // Prisma P2002 meta.target is string[] | string depending on the connector.
    const target: unknown = err.meta?.target;
    const fields: string[] = Array.isArray(target)
      ? target.filter((t): t is string => typeof t === 'string')
      : typeof target === 'string'
        ? [target]
        : [];
    return fields.some((f) => f.includes(field));
  }
  return false;
}
