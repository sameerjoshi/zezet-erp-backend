import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_KEY = 'audit_entity';

// Optionally name the entity an endpoint mutates, so the audit log records a
// clean entity name instead of one derived from the URL path. Apply to a
// controller (all routes) or a single handler:
//   @AuditEntity('User')
export const AuditEntity = (entity: string) =>
  SetMetadata(AUDIT_ENTITY_KEY, entity);
