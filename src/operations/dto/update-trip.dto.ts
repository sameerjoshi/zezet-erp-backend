import { PartialType } from '@nestjs/swagger';
import { CreateTripDto } from './create-trip.dto';

// All fields optional. Patching does NOT re-run rate prepopulation — it applies
// exactly the fields supplied (rate lookup happens only on create). Referential
// integrity (client/driver/helper/rate) is still validated for any id changed.
export class UpdateTripDto extends PartialType(CreateTripDto) {}
