import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

// Transition status and/or edit notes. Allowed status moves are validated in the
// service: draft → sent → paid, and void from any non-paid state. Marking `paid`
// sets amountPaid = total + paidAt (full payment; partial deferred — ADR 0004).
export class UpdateInvoiceDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
