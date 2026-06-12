import { ApiProperty } from '@nestjs/swagger';

export class DayTripCountDto {
  @ApiProperty({ format: 'date', example: '2026-06-12' })
  date!: string;

  @ApiProperty({ example: 7 })
  tripCount!: number;
}

export class TruckTripCountDto {
  @ApiProperty()
  truckId!: string;

  @ApiProperty({ example: 'Camión 7' })
  truckCode!: string;

  @ApiProperty({ example: 12 })
  tripCount!: number;
}

// Trip counts grouped by day and by truck for the requested range.
export class TripsReportResponseDto {
  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

  @ApiProperty({ description: 'Total trips in the range.' })
  totalTrips!: number;

  @ApiProperty({ type: DayTripCountDto, isArray: true })
  perDay!: DayTripCountDto[];

  @ApiProperty({ type: TruckTripCountDto, isArray: true })
  perTruck!: TruckTripCountDto[];
}
