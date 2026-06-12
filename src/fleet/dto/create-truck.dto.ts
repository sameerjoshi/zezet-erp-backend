import { ApiProperty } from '@nestjs/swagger';
import { TruckStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTruckDto {
  @ApiProperty({
    example: 'Camión 7',
    description: 'Unique human-facing code/name for the truck.',
  })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ required: false, example: 'PA-1234' })
  @IsOptional()
  @IsString()
  plate?: string;

  @ApiProperty({ required: false, example: 2019 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  year?: number;

  @ApiProperty({
    required: false,
    example: 24,
    description: 'Box length (ft).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sizeFt?: number;

  @ApiProperty({ required: false, example: '2019-03-15', format: 'date' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiProperty({
    required: false,
    example: 45000,
    description: 'Acquisition cost (financial — stripped for ops roles).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice?: number;

  @ApiProperty({ required: false, example: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerStart?: number;

  @ApiProperty({
    required: false,
    enum: TruckStatus,
    default: TruckStatus.active,
  })
  @IsOptional()
  @IsEnum(TruckStatus)
  status?: TruckStatus;
}
