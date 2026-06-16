import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

// Preview who gets paid (and how much) for a period before cutting the run.
export class PayrollPreviewQueryDto {
  @ApiProperty({ example: '2026-05-01', format: 'date' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-05-31', format: 'date' })
  @IsDateString()
  to!: string;
}

export class ListRunsQueryDto {
  @ApiPropertyOptional({
    enum: PayrollStatus,
    description: 'Filter by status.',
  })
  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;
}
