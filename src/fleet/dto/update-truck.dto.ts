import { PartialType } from '@nestjs/swagger';
import { CreateTruckDto } from './create-truck.dto';

// All fields optional. `code` may be renamed; the unique constraint still
// guards collisions (surfaced as a 400 by the service).
export class UpdateTruckDto extends PartialType(CreateTruckDto) {}
