import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: 'Refresh token issued by /auth/login or /auth/refresh',
  })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
