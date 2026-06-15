import { ApiProperty } from '@nestjs/swagger';

// Operational breakdown for a date range: of the trucks that had a recorded
// status each day, how many were operating vs idle (no clients) vs broken.
// Days/trucks with no recorded status are excluded from the percentage, so a
// Sunday or a not-yet-in-service truck does not deflate it.
export class OperationalBucketDto {
  @ApiProperty()
  operating!: number;

  @ApiProperty({ description: 'Idle for lack of clients (sales).' })
  noClients!: number;

  @ApiProperty({ description: 'Down for repair (mechanics).' })
  broken!: number;

  @ApiProperty({ description: 'operating + noClients + broken.' })
  recorded!: number;

  @ApiProperty({
    description: 'operating / recorded, 0..1 (×100 for percent).',
  })
  operatingPct!: number;
}

export class OperationalDayDto extends OperationalBucketDto {
  @ApiProperty({ format: 'date' })
  date!: string;
}

export class OperationalReportResponseDto {
  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

  @ApiProperty({ type: OperationalBucketDto })
  totals!: OperationalBucketDto;

  @ApiProperty({ type: OperationalDayDto, isArray: true })
  perDay!: OperationalDayDto[];
}
