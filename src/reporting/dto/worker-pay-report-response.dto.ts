import { ApiProperty } from '@nestjs/swagger';

// Per-worker pay. driverPay/helperPay/totalPay are money (2-dp strings) and are
// in FINANCIAL_FIELDS — the global gate strips them for non-financial callers
// (ops/driver never reach this endpoint anyway: they are 403'd on `Report`).
export class WorkerPayDto {
  @ApiProperty()
  workerId!: string;

  @ApiProperty()
  workerName!: string;

  @ApiProperty({ description: 'Sum of driverPay on trips driven (financial).' })
  driverPay!: string;

  @ApiProperty({ description: 'Sum of helperPay on trips helped (financial).' })
  helperPay!: string;

  @ApiProperty({ description: 'driverPay + helperPay (financial).' })
  totalPay!: string;
}

export class WorkerPayReportResponseDto {
  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

  @ApiProperty({ type: WorkerPayDto, isArray: true })
  workers!: WorkerPayDto[];
}
