import { ApiProperty } from '@nestjs/swagger';
import { PayrollStatus } from '@prisma/client';

// Money serializes as 2-dp strings. Payroll endpoints are reachable only by
// Payroll readers (admin/finance/investor), so money is never stripped.

// One worker's payout in a run (lines aggregated by worker).
export class WorkerStatementDto {
  @ApiProperty() workerId!: string;
  @ApiProperty() workerName!: string;
  @ApiProperty() driverPay!: string;
  @ApiProperty() helperPay!: string;
  @ApiProperty() totalPay!: string;
  @ApiProperty({ description: 'Distinct trips this worker was paid for.' })
  tripCount!: number;
}

export class PayrollRunResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'PAY-2026-0001' }) number!: string;
  @ApiProperty({ format: 'date' }) periodFrom!: Date;
  @ApiProperty({ format: 'date' }) periodTo!: Date;
  @ApiProperty({ enum: PayrollStatus }) status!: PayrollStatus;
  @ApiProperty() total!: string;
  @ApiProperty() workerCount!: number;
  @ApiProperty({ required: false, nullable: true }) paidAt!: Date | null;
  @ApiProperty({ required: false, nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PayrollRunDetailResponseDto extends PayrollRunResponseDto {
  @ApiProperty({ type: WorkerStatementDto, isArray: true })
  workers!: WorkerStatementDto[];
}

export class PayrollPreviewResponseDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ type: WorkerStatementDto, isArray: true })
  workers!: WorkerStatementDto[];
  @ApiProperty() workerCount!: number;
  @ApiProperty() total!: string;
}
