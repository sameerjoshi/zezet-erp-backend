import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

// PATCH a draft log's mutable fields. date/truckId are immutable (they form the
// unique key); change them by creating a different log. All fields optional —
// `undefined` is skipped by Prisma so the patch stays partial.
export class UpdateDailyLogDto {
  @ApiProperty({
    required: false,
    description: 'Fuel cost (financial — stripped for ops roles).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fuelCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerStart?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerEnd?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
