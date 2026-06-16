import { ApiProperty } from '@nestjs/swagger';

// Per-truck profit & loss over a range (ADR 0006). All money as 2-dp strings.
// profit = revenue − fuel − driverPay − helperPay − costs (cash costs).
export class TruckPnlRowDto {
  @ApiProperty() truckId!: string;
  @ApiProperty() truckCode!: string;
  @ApiProperty() revenue!: string;
  @ApiProperty() fuel!: string;
  @ApiProperty() driverPay!: string;
  @ApiProperty() helperPay!: string;
  @ApiProperty({ description: 'Other costs (maintenance, tolls, etc.).' })
  costs!: string;
  @ApiProperty() profit!: string;
}

export class TruckPnlTotalsDto {
  @ApiProperty() revenue!: string;
  @ApiProperty() fuel!: string;
  @ApiProperty() driverPay!: string;
  @ApiProperty() helperPay!: string;
  @ApiProperty() costs!: string;
  @ApiProperty() profit!: string;
}

export class TruckPnlResponseDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ type: TruckPnlRowDto, isArray: true })
  perTruck!: TruckPnlRowDto[];
  @ApiProperty({ type: TruckPnlTotalsDto }) totals!: TruckPnlTotalsDto;
}
