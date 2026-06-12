import { RoleKey } from '@prisma/client';
import { Action, CaslAbilityFactory } from './casl-ability.factory';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

function user(...roles: RoleKey[]): AuthUser {
  return { userId: 'u1', username: 'u', roles };
}

describe('CaslAbilityFactory', () => {
  const factory = new CaslAbilityFactory();

  it('admin can manage everything', () => {
    const a = factory.createForUser(user(RoleKey.admin));
    expect(a.can(Action.Manage, 'all')).toBe(true);
    expect(a.can(Action.Read, 'Financial')).toBe(true);
    expect(a.can(Action.Read, 'Report')).toBe(true);
    expect(a.can(Action.Manage, 'User')).toBe(true);
  });

  it('finance reads financial data but cannot manage users', () => {
    const a = factory.createForUser(user(RoleKey.finance));
    expect(a.can(Action.Read, 'Financial')).toBe(true);
    expect(a.can(Action.Read, 'Report')).toBe(true);
    expect(a.can(Action.Manage, 'User')).toBe(false);
  });

  it('investor is read-only on reports + financials', () => {
    const a = factory.createForUser(user(RoleKey.investor));
    expect(a.can(Action.Read, 'Report')).toBe(true);
    expect(a.can(Action.Read, 'Financial')).toBe(true);
    expect(a.can(Action.Manage, 'Report')).toBe(false);
    expect(a.can(Action.Manage, 'User')).toBe(false);
  });

  it.each([RoleKey.ops_manager, RoleKey.ops_staff, RoleKey.driver])(
    '%s cannot read financial data or reports',
    (role) => {
      const a = factory.createForUser(user(role));
      expect(a.can(Action.Read, 'Financial')).toBe(false);
      expect(a.can(Action.Read, 'Report')).toBe(false);
      expect(a.can(Action.Manage, 'User')).toBe(false);
    },
  );

  it('ops_manager can manage operational entities', () => {
    const a = factory.createForUser(user(RoleKey.ops_manager));
    expect(a.can(Action.Manage, 'Trip')).toBe(true);
    expect(a.can(Action.Manage, 'Truck')).toBe(true);
  });

  it('a finance+ops user retains financial read access', () => {
    const a = factory.createForUser(user(RoleKey.finance, RoleKey.ops_manager));
    expect(a.can(Action.Read, 'Financial')).toBe(true);
  });

  it('no user (anonymous) can do nothing', () => {
    const a = factory.createForUser(undefined);
    expect(a.can(Action.Read, 'Financial')).toBe(false);
    expect(a.can(Action.Read, 'Trip')).toBe(false);
    expect(a.can(Action.Manage, 'User')).toBe(false);
  });
});
