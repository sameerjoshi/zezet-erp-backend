import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RateLookupQueryDto {
  @ApiProperty({ description: 'Client whose effective rate is requested.' })
  @IsString()
  @MinLength(1)
  clientId!: string;

  @ApiPropertyOptional({
    description:
      'Optional route/service label to match exactly. Omit to match rates ' +
      'regardless of label.',
  })
  @IsOptional()
  @IsString()
  label?: string;
}
