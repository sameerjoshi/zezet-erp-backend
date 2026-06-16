import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';

// All money fields serialize as 2-dp strings. Billing endpoints are reachable
// only by Invoice readers (admin/finance/investor), so money is never stripped.

export class InvoiceLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Source trip (snapshot reference).' })
  tripId!: string;
  @ApiProperty({ format: 'date' }) date!: Date;
  @ApiProperty() truckCode!: string;
  @ApiProperty({ required: false, nullable: true }) routeLabel!: string | null;
  @ApiProperty() billAmount!: string;
}

export class InvoiceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'INV-2026-0001' }) number!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty() clientName!: string;
  @ApiProperty({ format: 'date' }) periodFrom!: Date;
  @ApiProperty({ format: 'date' }) periodTo!: Date;
  @ApiProperty({ enum: InvoiceStatus }) status!: InvoiceStatus;
  @ApiProperty({ format: 'date' }) issueDate!: Date;
  @ApiProperty() total!: string;
  @ApiProperty() amountPaid!: string;
  @ApiProperty({ required: false, nullable: true }) paidAt!: Date | null;
  @ApiProperty({ required: false, nullable: true }) notes!: string | null;
  @ApiProperty({ description: 'Number of billed lines.' }) lineCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class InvoiceDetailResponseDto extends InvoiceResponseDto {
  @ApiProperty({ type: InvoiceLineResponseDto, isArray: true })
  lines!: InvoiceLineResponseDto[];
}

// One trip eligible to be billed (preview before creating an invoice).
export class BillableTripDto {
  @ApiProperty() tripId!: string;
  @ApiProperty({ format: 'date' }) date!: Date;
  @ApiProperty() truckCode!: string;
  @ApiProperty({ required: false, nullable: true }) routeLabel!: string | null;
  @ApiProperty() billAmount!: string;
}

export class BillablePreviewResponseDto {
  @ApiProperty() clientId!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ type: BillableTripDto, isArray: true })
  trips!: BillableTripDto[];
  @ApiProperty() tripCount!: number;
  @ApiProperty() total!: string;
}

// AR aging: one client's outstanding (sent, unpaid) invoice exposure by age band.
export class AgingClientDto {
  @ApiProperty() clientId!: string;
  @ApiProperty() clientName!: string;
  @ApiProperty({ description: '0..30 days since issue.' }) current!: string;
  @ApiProperty({ description: '31..60 days.' }) d30!: string;
  @ApiProperty({ description: '61..90 days.' }) d60!: string;
  @ApiProperty({ description: '90+ days.' }) d90!: string;
  @ApiProperty() total!: string;
}

export class AgingResponseDto {
  @ApiProperty({ type: AgingClientDto, isArray: true })
  clients!: AgingClientDto[];
  @ApiProperty() grandTotal!: string;
}
