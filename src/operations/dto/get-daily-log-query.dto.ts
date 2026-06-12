import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString } from 'class-validator';

// Lookup a single log by its natural key (date + truck). The frontend calls
// this first; on 404 it POSTs to create one (the get-or-create flow).
export class GetDailyLogQueryDto {
  @ApiProperty({ example: '2026-06-12', format: 'date' })
  @IsDateString()
  date!: string;

  @ApiProperty()
  @IsString()
  truckId!: string;
}
