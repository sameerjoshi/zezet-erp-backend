import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class ClientResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Distribuidora La Selva' })
  name!: string;

  @ApiProperty({ required: false, nullable: true })
  code!: string | null;

  @ApiProperty({ required: false, nullable: true })
  billingFrequency!: string | null;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
