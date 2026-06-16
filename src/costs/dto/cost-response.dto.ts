import { ApiProperty } from '@nestjs/swagger';
import { CostCategory } from '@prisma/client';

export class CostResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() truckId!: string;
  @ApiProperty() truckCode!: string;
  @ApiProperty({ format: 'date' }) date!: Date;
  @ApiProperty({ enum: CostCategory }) category!: CostCategory;
  @ApiProperty() amount!: string;
  @ApiProperty({ required: false, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: Date;
}
