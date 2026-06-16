import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CostCategory } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Record one per-truck cost (maintenance, toll, etc.) on the day it occurred.
export class CreateCostDto {
  @ApiProperty()
  @IsString()
  truckId!: string;

  @ApiProperty({ example: '2026-05-10', format: 'date' })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: CostCategory })
  @IsEnum(CostCategory)
  category!: CostCategory;

  @ApiProperty({ example: 150.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
