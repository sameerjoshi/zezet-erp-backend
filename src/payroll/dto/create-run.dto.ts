import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

// Create a draft pay run for a period. The service snapshots each not-yet-paid
// trip's driver/helper pay in [from, to] as frozen lines.
export class CreateRunDto {
  @ApiProperty({ example: '2026-05-01', format: 'date' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-05-31', format: 'date' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
