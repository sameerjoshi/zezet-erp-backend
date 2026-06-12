import { ApiProperty } from '@nestjs/swagger';
import { RoleKey, UserStatus } from '@prisma/client';

// User shape returned by the admin endpoints. The passwordHash is NEVER
// included — these DTOs are the only thing controllers return.
export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    example: 'mgomez',
    description: 'Generated username (firstInitial+lastName).',
  })
  username!: string;

  @ApiProperty({ required: false, nullable: true })
  email!: string | null;

  @ApiProperty({ required: false, nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 'en' })
  locale!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ enum: RoleKey, isArray: true })
  roles!: RoleKey[];

  @ApiProperty()
  createdAt!: Date;
}

export class RoleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: RoleKey })
  key!: RoleKey;

  @ApiProperty({ example: 'Operations Manager' })
  name!: string;
}
