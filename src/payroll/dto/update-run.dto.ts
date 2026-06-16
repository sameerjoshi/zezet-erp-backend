import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

// Transition status and/or edit notes. Allowed moves (validated in the service):
// draft → approved → paid, and void from any non-paid state. Marking paid sets
// paidAt (per-worker partial payment deferred — ADR 0005).
export class UpdateRunDto {
  @ApiPropertyOptional({ enum: PayrollStatus })
  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
