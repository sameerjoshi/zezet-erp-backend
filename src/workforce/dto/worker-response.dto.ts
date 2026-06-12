import { ApiProperty } from '@nestjs/swagger';
import { UserStatus, WorkerType } from '@prisma/client';

export class WorkerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Juan Pérez' })
  fullName!: string;

  @ApiProperty({ enum: WorkerType })
  type!: WorkerType;

  @ApiProperty()
  canDrive!: boolean;

  @ApiProperty()
  canHelp!: boolean;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ required: false, nullable: true })
  userId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
