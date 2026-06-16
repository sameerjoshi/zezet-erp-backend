import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AccountKind, UserStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: 'St Georges Bank' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ enum: AccountKind, default: AccountKind.bank })
  @IsOptional()
  @IsEnum(AccountKind)
  kind?: AccountKind;

  @ApiPropertyOptional({ example: 0, description: 'Starting balance.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  openingBalance?: number;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Make this the auto-post account.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

// Account with its live balance (openingBalance + inflows − outflows).
export class AccountResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: AccountKind }) kind!: AccountKind;
  @ApiProperty() openingBalance!: string;
  @ApiProperty({ description: 'Current balance.' }) balance!: string;
  @ApiProperty({ description: 'Auto-posted entries land here.' })
  isDefault!: boolean;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty() createdAt!: Date;
}
