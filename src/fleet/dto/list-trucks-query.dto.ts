import { ApiPropertyOptional } from '@nestjs/swagger';
import { TruckStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListTrucksQueryDto {
  @ApiPropertyOptional({
    enum: TruckStatus,
    description: 'Filter by status (omit for all).',
  })
  @IsOptional()
  @IsEnum(TruckStatus)
  status?: TruckStatus;
}
