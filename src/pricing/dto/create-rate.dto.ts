import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateRateDto {
  @ApiProperty({
    required: false,
    example: 'Ciudad → Colón',
    description: 'Route/service label used by the trip-prepopulation lookup.',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ example: 350, description: 'Price charged to the client.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  clientPrice!: number;

  @ApiProperty({ example: 120, description: 'Driver pay for this rate.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  driverPay!: number;

  @ApiProperty({ example: 60, description: 'Helper pay for this rate.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  helperPay!: number;

  @ApiProperty({
    required: false,
    format: 'date-time',
    description: 'When this rate becomes effective (defaults to now).',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiProperty({
    required: false,
    format: 'date-time',
    description: 'When this rate stops being effective (null = open-ended).',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
