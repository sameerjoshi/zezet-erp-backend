import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

// Inclusive date range for every report. Both bounds are optional: when omitted
// the service defaults to a trailing 30-day window (`to` = today, `from` = today
// − 29 days). Dates are ISO `YYYY-MM-DD`; the range filters DailyTruckLog.date.
export class ReportRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-06-01',
    format: 'date',
    description: 'Inclusive start date. Defaults to (to − 29 days).',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
    format: 'date',
    description: 'Inclusive end date. Defaults to today (UTC).',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
