import { ApiProperty } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';

// Response shapes exist so the OpenAPI spec (and the generated frontend client)
// describe auth payloads accurately.

export class TokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

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
