import { ApiProperty } from '@nestjs/swagger';
import { UserStatus, WorkerType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateWorkerDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ enum: WorkerType, default: WorkerType.contractor })
  @IsOptional()
  @IsEnum(WorkerType)
  type?: WorkerType;

  @ApiProperty({ default: true, description: 'Can be assigned as a driver.' })
  @IsOptional()
  @IsBoolean()
  canDrive?: boolean;

  @ApiProperty({ default: true, description: 'Can be assigned as a helper.' })
  @IsOptional()
  @IsBoolean()
  canHelp?: boolean;

  @ApiProperty({
    required: false,
    enum: UserStatus,
    default: UserStatus.active,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiProperty({
    required: false,
    description: 'Optional link to a User account (future driver login).',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
