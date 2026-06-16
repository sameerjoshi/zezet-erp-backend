import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

// Create a draft invoice for a client over an arbitrary, client-driven period.
// The service snapshots that client's not-yet-billed trips in [from, to] as
// frozen lines and sums them into the total.
export class CreateInvoiceDto {
  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiProperty({ example: '2026-05-01', format: 'date' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-05-31', format: 'date' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
