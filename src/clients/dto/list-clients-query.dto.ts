import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListClientsQueryDto {
  @ApiPropertyOptional({ enum: UserStatus, description: 'Filter by status.' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
