import { ApiProperty } from '@nestjs/swagger';
import { LogStatus } from '@prisma/client';

// Summed money for a log. The three keys are financial — the global gate strips
// them for ops roles, who still receive `tripCount`.
export class DailyLogTotalsDto {
  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  billAmount!: string;

  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  driverPay!: string;

  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  helperPay!: string;
}

// A daily log with derived totals + non-blocking warnings. `fuelCost` is
// financial (stripped for ops). Returned by create/update/confirm.
export class DailyLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'date' })
  date!: Date;

  @ApiProperty()
  truckId!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Financial — absent for ops roles.',
  })
  fuelCost!: string | null;

  @ApiProperty({ required: false, nullable: true })
  odometerStart!: number | null;

  @ApiProperty({ required: false, nullable: true })
  odometerEnd!: number | null;

  @ApiProperty({ required: false, nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: LogStatus })
  status!: LogStatus;

  @ApiProperty({ required: false, nullable: true })
  enteredById!: string | null;

  @ApiProperty({ description: 'Number of trips under this log.' })
  tripCount!: number;

  @ApiProperty({ type: DailyLogTotalsDto })
  totals!: DailyLogTotalsDto;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Non-blocking validation warnings (odometer/empty-confirm).',
  })
  warnings!: string[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
