import { ApiProperty } from '@nestjs/swagger';
import { RateResponseDto } from './rate-response.dto';

// Lookup result. `found` is the unambiguous signal for the frontend: when
// false, no effective rate exists and the user types the trip figures manually.
export class RateLookupResponseDto {
  @ApiProperty({ description: 'Whether an effective rate was found.' })
  found!: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    type: () => RateResponseDto,
    description: 'The effective rate, or null when none applies.',
  })
  rate!: RateResponseDto | null;
}
