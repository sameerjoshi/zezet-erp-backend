import { ApiProperty } from '@nestjs/swagger';

// Rate shape. clientPrice/driverPay/helperPay are money fields serialized as
// strings; the global financial gate removes those three keys for users who
// cannot read `Financial` (ops callers of the lookup get the rate without the
// figures and type them manually).
export class RateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  rateCardId!: string;

  @ApiProperty({ required: false, nullable: true, example: 'Ciudad → Colón' })
  label!: string | null;

  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  clientPrice!: string;

  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  driverPay!: string;

  @ApiProperty({ description: 'Financial — absent for ops roles.' })
  helperPay!: string;

  @ApiProperty()
  effectiveFrom!: Date;

  @ApiProperty({ required: false, nullable: true })
  effectiveTo!: Date | null;
}
