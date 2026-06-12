import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Generated username' })
  @IsString()
  @MinLength(1)
  username!: string;

  @ApiProperty({
    example: 'admin123',
    description: 'Plain password (verified against argon2 hash)',
  })
  @IsString()
  @MinLength(1)
  password!: string;
}
