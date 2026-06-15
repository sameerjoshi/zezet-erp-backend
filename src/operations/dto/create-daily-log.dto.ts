import { ApiProperty } from '@nestjs/swagger';
import { OperStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDailyLogDto {
  @ApiProperty({
    example: '2026-06-12',
    format: 'date',
    description: 'Calendar date of the log. Unique together with truckId.',
  })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: 'Truck this log belongs to.' })
  @IsString()
  truckId!: string;

  @ApiProperty({
    required: false,
    enum: OperStatus,
    description:
      'What the truck did that day: operating / no_clients / broken. ' +
      'Omit when not yet recorded.',
  })
  @IsOptional()
  @IsEnum(OperStatus)
  operStatus?: OperStatus;

  @ApiProperty({
    required: false,
    example: 45,
    description: 'Fuel cost for the day (financial — stripped for ops roles).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fuelCost?: number;

  @ApiProperty({ required: false, example: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerStart?: number;

  @ApiProperty({ required: false, example: 120140 })
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerEnd?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
