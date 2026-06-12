import { ApiProperty } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';

export class SetRolesDto {
  @ApiProperty({
    enum: RoleKey,
    isArray: true,
    example: [RoleKey.ops_manager, RoleKey.finance],
    description: "Replaces the user's roles with exactly this set.",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RoleKey, { each: true })
  roles!: RoleKey[];
}
