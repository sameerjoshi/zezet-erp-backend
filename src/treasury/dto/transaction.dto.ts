import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TxCategory, TxDirection } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ example: '2026-05-10', format: 'date' })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: TxDirection })
  @IsEnum(TxDirection)
  direction!: TxDirection;

  @ApiProperty({ example: 250.0, description: 'Positive; direction signs it.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiProperty({ enum: TxCategory })
  @IsEnum(TxCategory)
  category!: TxCategory;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiPropertyOptional({ description: 'Optional truck allocation.' })
  @IsOptional()
  @IsString()
  truckId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ListTransactionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ enum: TxCategory })
  @IsOptional()
  @IsEnum(TxCategory)
  category?: TxCategory;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TransactionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty({ format: 'date' }) date!: Date;
  @ApiProperty({ enum: TxDirection }) direction!: TxDirection;
  @ApiProperty() amount!: string;
  @ApiProperty({ enum: TxCategory }) category!: TxCategory;
  @ApiProperty() description!: string;
  @ApiProperty({ required: false, nullable: true }) truckId!: string | null;
  @ApiProperty({ required: false, nullable: true }) truckCode!: string | null;
  @ApiProperty({ required: false, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: Date;
}
