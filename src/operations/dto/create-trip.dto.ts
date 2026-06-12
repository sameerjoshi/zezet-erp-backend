import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Create a trip under a daily log. When `rateId` is omitted the service looks up
// the effective rate (clientId + routeLabel) and prepopulates
// billAmount/driverPay/helperPay — but ANY money field supplied here overrides
// the rate (editable). Ops roles, who cannot read money in responses, simply
// type the figures in here manually.
export class CreateTripDto {
  @ApiProperty({ description: 'Client billed for this trip.' })
  @IsString()
  clientId!: string;

  @ApiProperty({ required: false, example: 'Ciudad → Colón' })
  @IsOptional()
  @IsString()
  routeLabel?: string;

  @ApiProperty({ description: 'Driver (Worker) for the trip.' })
  @IsString()
  driverWorkerId!: string;

  @ApiProperty({ required: false, description: 'Optional helper (Worker).' })
  @IsOptional()
  @IsString()
  helperWorkerId?: string;

  @ApiProperty({
    required: false,
    description:
      'Charge to the client. Overrides the rate when given; defaults from ' +
      'the effective rate, else 0.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  billAmount?: number;

  @ApiProperty({
    required: false,
    description: 'Driver pay. Overrides the rate when given.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  driverPay?: number;

  @ApiProperty({
    required: false,
    description: 'Helper pay. Overrides the rate when given.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  helperPay?: number;

  @ApiProperty({
    required: false,
    description:
      'Explicit rate to apply. When omitted, the effective rate is resolved ' +
      'from clientId + routeLabel.',
  })
  @IsOptional()
  @IsString()
  rateId?: string;
}
