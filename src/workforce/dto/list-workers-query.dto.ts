import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus, WorkerType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListWorkersQueryDto {
  @ApiPropertyOptional({ enum: UserStatus, description: 'Filter by status.' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: WorkerType, description: 'Filter by type.' })
  @IsOptional()
  @IsEnum(WorkerType)
  type?: WorkerType;
}
