import { ApiProperty } from '@nestjs/swagger';
import { TruckStatus } from '@prisma/client';

// Truck shape returned by the fleet endpoints. `purchasePrice` is a money field:
// it is serialized here as a string, but the global financial gate removes the
// key entirely for users who cannot read `Financial` (ops roles).
export class TruckResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Camión 7' })
  code!: string;

  @ApiProperty({ required: false, nullable: true })
  plate!: string | null;

  @ApiProperty({ required: false, nullable: true })
  year!: number | null;

  @ApiProperty({ required: false, nullable: true })
  sizeFt!: number | null;

  @ApiProperty({ required: false, nullable: true })
  purchaseDate!: Date | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Financial — absent in responses to ops roles.',
  })
  purchasePrice!: string | null;

  @ApiProperty({ required: false, nullable: true })
  odometerStart!: number | null;

  @ApiProperty({ enum: TruckStatus })
  status!: TruckStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
