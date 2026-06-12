import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ example: 'Distribuidora La Selva' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    required: false,
    example: 'SELVA',
    description: 'Optional unique short code.',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({
    required: false,
    example: 'monthly',
    description: 'Free-text billing cadence hint (periods are client-driven).',
  })
  @IsOptional()
  @IsString()
  billingFrequency?: string;

  @ApiProperty({
    required: false,
    enum: UserStatus,
    default: UserStatus.active,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
