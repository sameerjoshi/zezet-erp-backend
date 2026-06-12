import { ApiProperty } from '@nestjs/swagger';

// Per-client billables. billAmount is money (2-dp string) and in
// FINANCIAL_FIELDS — stripped by the global gate for non-financial callers
// (ops/driver are 403'd on `Report` before they get here).
export class ClientBillableDto {
  @ApiProperty()
  clientId!: string;

  @ApiProperty()
  clientName!: string;

  @ApiProperty({ description: 'Trips billed to this client in the range.' })
  tripCount!: number;

  @ApiProperty({ description: 'Sum of billAmount (financial).' })
  billAmount!: string;
}

export class ClientBillablesReportResponseDto {
  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

  @ApiProperty({ type: ClientBillableDto, isArray: true })
  clients!: ClientBillableDto[];
}
