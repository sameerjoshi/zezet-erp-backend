import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class OperationsSummaryQueryDto {
  @ApiProperty({
    example: '2026-06-12',
    format: 'date',
    description: 'Date to summarize per-truck log status for.',
  })
  @IsDateString()
  date!: string;
}
