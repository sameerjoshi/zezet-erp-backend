import { ApiProperty } from '@nestjs/swagger';
import { DailyLogResponseDto } from './daily-log-response.dto';
import { TripResponseDto } from './trip-response.dto';

// A daily log plus its trips — returned by the single-log GET endpoints. Trip
// money fields are stripped per-item for ops roles by the global gate.
export class DailyLogDetailResponseDto extends DailyLogResponseDto {
  @ApiProperty({ type: TripResponseDto, isArray: true })
  trips!: TripResponseDto[];
}
