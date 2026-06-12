import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRateCardDto {
  @ApiProperty({ example: 'Standard 2026', description: 'Rate card label.' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    required: false,
    enum: UserStatus,
    default: UserStatus.active,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
