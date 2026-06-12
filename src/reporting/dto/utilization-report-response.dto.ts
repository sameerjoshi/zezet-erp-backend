import { ApiProperty } from '@nestjs/swagger';

export class DayUtilizationDto {
  @ApiProperty({ format: 'date', example: '2026-06-12' })
  date!: string;

  @ApiProperty({ description: 'Active trucks in the fleet (current status).' })
  activeTrucks!: number;

  @ApiProperty({ description: 'Distinct active trucks with ≥1 trip that day.' })
  trucksWithTrips!: number;

  @ApiProperty({
    example: 0.75,
    description: 'trucksWithTrips ÷ activeTrucks (0..1, 4-dp). 0 if no trucks.',
  })
  utilization!: number;
}

// Per-day active-truck utilization across the requested range (every day in the
// range is present, including zero-trip days).
export class UtilizationReportResponseDto {
  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

  @ApiProperty({ type: DayUtilizationDto, isArray: true })
  perDay!: DayUtilizationDto[];
}
