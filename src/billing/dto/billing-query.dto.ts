import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

// Preview the trips that would be billed for a client over an arbitrary period.
export class BillableQueryDto {
  @ApiProperty({ description: 'Client to bill.' })
  @IsString()
  clientId!: string;

  @ApiProperty({ example: '2026-05-01', format: 'date' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-05-31', format: 'date' })
  @IsDateString()
  to!: string;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({
    enum: InvoiceStatus,
    description: 'Filter by status.',
  })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ description: 'Filter by client.' })
  @IsOptional()
  @IsString()
  clientId?: string;
}
