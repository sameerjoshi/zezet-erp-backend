import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class RateCardResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clientId!: string;

  @ApiProperty({ example: 'Standard 2026' })
  name!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty()
  createdAt!: Date;
}
