import { ApiProperty } from '@nestjs/swagger';

export class CashAccountDto {
  @ApiProperty() accountId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() balance!: string;
}

// Total cash across active accounts.
export class CashPositionResponseDto {
  @ApiProperty({ type: CashAccountDto, isArray: true })
  accounts!: CashAccountDto[];
  @ApiProperty() total!: string;
}
