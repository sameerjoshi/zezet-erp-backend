import { ApiProperty } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  // Username is GENERATED from this (firstInitial+lastName, lowercased); the
  // full name itself is not persisted (User has no name column).
  @ApiProperty({
    example: 'Mario Gomez',
    description: 'Full name; the username is generated from it.',
  })
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ required: false, example: 'mario@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '+50760000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'initial-password-123',
    description: 'Initial password (argon2-hashed; never stored in plaintext).',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    enum: RoleKey,
    isArray: true,
    example: [RoleKey.ops_staff],
    description: 'Role keys to assign on creation (at least one).',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RoleKey, { each: true })
  roles!: RoleKey[];

  @ApiProperty({
    required: false,
    enum: ['en', 'es'],
    example: 'en',
    description: 'UI locale.',
  })
  @IsOptional()
  @IsIn(['en', 'es'])
  locale?: string;
}
