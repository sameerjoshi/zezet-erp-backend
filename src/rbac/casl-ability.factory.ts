import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { RoleKey } from '@prisma/client';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

// CRUD verbs. `Manage` is CASL's wildcard action (implies all others).
export enum Action {
  Manage = 'manage',
  Read = 'read',
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
}

// Subjects are modelled as strings (Prisma exposes interfaces, not classes, so
// there is nothing to key class-based detection off). `Financial` is a virtual
// subject representing "money data" — the field-level gate keys off it, not off
// any single table. `Report` covers any reporting/aggregation endpoint. `all`
// is CASL's wildcard subject.
export type AppSubject =
  | 'User'
  | 'Role'
  | 'Worker'
  | 'Truck'
  | 'Client'
  | 'RateCard'
  | 'Rate'
  | 'DailyTruckLog'
  | 'Trip'
  | 'Invoice'
  | 'Report'
  | 'Financial'
  | 'all';

export type AppAbility = MongoAbility<[Action, AppSubject]>;

// Operations roles — the set that, on their own, must never see money/reports.
const OPS_ROLES: readonly RoleKey[] = [
  RoleKey.ops_manager,
  RoleKey.ops_staff,
  RoleKey.driver,
];

// Roles that legitimately read financial data + reports.
const FINANCIAL_ROLES: readonly RoleKey[] = [
  RoleKey.admin,
  RoleKey.finance,
  RoleKey.investor,
];

@Injectable()
export class CaslAbilityFactory {
  // Builds the ability for a request's user. `undefined` (no/anonymous user)
  // yields an empty, deny-by-default ability — safest for the global gate.
  createForUser(user?: AuthUser): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );
    const roles = user?.roles ?? [];

    // admin — unrestricted.
    if (roles.includes(RoleKey.admin)) {
      can(Action.Manage, 'all');
    }

    // finance — reads everything (incl. money) and owns financial data.
    if (roles.includes(RoleKey.finance)) {
      can(Action.Read, 'all');
      can(Action.Read, 'Financial');
      can(Action.Manage, [
        'Rate',
        'RateCard',
        'Report',
        'Financial',
        'Trip',
        'Invoice',
      ]);
    }

    // investor — read-only on reports + invoices; needs the figures they carry.
    if (roles.includes(RoleKey.investor)) {
      can(Action.Read, 'Report');
      can(Action.Read, 'Invoice');
      can(Action.Read, 'Financial');
    }

    // ops_manager — runs operations master data + the daily logbook.
    if (roles.includes(RoleKey.ops_manager)) {
      can(Action.Manage, [
        'Worker',
        'Truck',
        'Client',
        'Trip',
        'DailyTruckLog',
      ]);
    }

    // ops_staff — records operations; cannot manage master data.
    if (roles.includes(RoleKey.ops_staff)) {
      can(Action.Read, ['Worker', 'Truck', 'Client', 'Trip', 'DailyTruckLog']);
      can([Action.Create, Action.Update], ['Trip', 'DailyTruckLog']);
    }

    // driver — sees the trips/logs they are involved in (scoping enforced later).
    if (roles.includes(RoleKey.driver)) {
      can(Action.Read, ['Trip', 'DailyTruckLog', 'Truck']);
    }

    // HARD RULE: an operations role grants NO sight of money or reports.
    // We only assert the explicit `cannot` when the user has no role that would
    // legitimately grant financial access — otherwise a finance+ops user would
    // be wrongly blocked (CASL: a later `cannot` overrides an earlier `can`).
    const canSeeMoney = roles.some((r) => FINANCIAL_ROLES.includes(r));
    const isOps = roles.some((r) => OPS_ROLES.includes(r));
    if (isOps && !canSeeMoney) {
      cannot(Action.Read, 'Financial').because(
        'Operations roles cannot view financial data',
      );
      cannot(Action.Read, 'Report').because(
        'Operations roles cannot view reports',
      );
    }

    return build();
  }
}
