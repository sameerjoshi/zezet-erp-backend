import { ApiProperty } from '@nestjs/swagger';
import { OperStatus } from '@prisma/client';

// Per-truck log status for a date. `status`:
//   none      — no log exists for the truck that day
//   draft     — a log exists but is not yet confirmed
//   confirmed — the log has been confirmed
export type TruckDaySummaryStatus = 'none' | 'draft' | 'confirmed';

export class TruckDaySummaryDto {
  @ApiProperty()
  truckId!: string;

  @ApiProperty()
  truckCode!: string;

  @ApiProperty({ enum: ['none', 'draft', 'confirmed'] })
  status!: TruckDaySummaryStatus;

  @ApiProperty({
    required: false,
    nullable: true,
    enum: OperStatus,
    description:
      'Operational status that day: operating / no_clients / broken.',
  })
  operStatus!: OperStatus | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Log id when one exists, else null.',
  })
  logId!: string | null;

  @ApiProperty({ description: 'Trips recorded for this truck that day.' })
  tripCount!: number;
}

// Fleet roll-up counts for the dashboard.
export class OperationsSummaryCountsDto {
  @ApiProperty({ description: 'Active trucks considered.' })
  trucks!: number;

  @ApiProperty()
  none!: number;

  @ApiProperty()
  draft!: number;

  @ApiProperty()
  confirmed!: number;
}

export class OperationsSummaryResponseDto {
  @ApiProperty({ format: 'date' })
  date!: Date;

  @ApiProperty({ type: TruckDaySummaryDto, isArray: true })
  trucks!: TruckDaySummaryDto[];

  @ApiProperty({ type: OperationsSummaryCountsDto })
  counts!: OperationsSummaryCountsDto;
}
