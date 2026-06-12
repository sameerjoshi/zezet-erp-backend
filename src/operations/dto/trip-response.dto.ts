import { ApiProperty } from '@nestjs/swagger';

// Trip shape. billAmount/driverPay/helperPay are money fields serialized as
// 2-dp strings; the global financial gate removes those keys entirely for users
// who cannot read `Financial` (ops roles).
export class TripResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  dailyLogId!: string;

  @ApiProperty({ description: 'Sequence within the log (1-based).' })
  seq!: number;

  @ApiProperty()
  clientId!: string;

  @ApiProperty({ required: false, nullable: true })
  routeLabel!: string | null;

  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  billAmount!: string;

  @ApiProperty()
  driverWorkerId!: string;

  @ApiProperty({ required: false, nullable: true })
  helperWorkerId!: string | null;

  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  driverPay!: string;

  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  helperPay!: string;

  @ApiProperty({ required: false, nullable: true })
  rateId!: string | null;

  @ApiProperty({ required: false, nullable: true })
  createdById!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
