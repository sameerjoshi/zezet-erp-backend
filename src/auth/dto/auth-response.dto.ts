import { ApiProperty } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';

// Response shapes exist so the OpenAPI spec (and the generated frontend client)
// describe auth payloads accurately.

// Response body for login/refresh. The refresh token is NOT here — it's set as
// an httpOnly cookie (ADR 0001). Only the short-lived access token is returned.
export class AccessTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({
    description: 'Access-token lifetime in seconds',
    example: 900,
  })
  expiresIn!: number;
}

export class MeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ example: 'en', description: 'UI locale: en | es' })
  locale!: string;

  @ApiProperty({ enum: RoleKey, isArray: true })
  roles!: RoleKey[];
}
