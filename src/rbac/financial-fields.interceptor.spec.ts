import { CallHandler, ExecutionContext } from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import { lastValueFrom, of } from 'rxjs';
import { CaslAbilityFactory } from './casl-ability.factory';
import {
  FinancialFieldsInterceptor,
  stripFinancialFields,
} from './financial-fields.interceptor';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

// A representative trip payload with money at the top level AND nested inside a
// relation + an array — exactly the shapes the gate must reach.
interface SampleTrip {
  id: string;
  routeLabel: string;
  billAmount?: string;
  driverPay?: string;
  helperPay?: string;
  driver: { id: string; fullName: string };
  rate: { id: string; label: string; clientPrice?: string; driverPay?: string };
  sub: Array<{ id: string; billAmount?: string; note: string }>;
}

function sampleTrip(): SampleTrip {
  return {
    id: 'trip_1',
    routeLabel: 'Panamá → Colón',
    billAmount: '250.00',
    driverPay: '80.00',
    helperPay: '40.00',
    driver: { id: 'w1', fullName: 'Mario Gomez' },
    rate: { id: 'r1', label: 'Std', clientPrice: '250.00', driverPay: '80.00' },
    sub: [{ id: 's1', billAmount: '10.00', note: 'extra' }],
  };
}

function mockContext(user?: AuthUser): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function mockHandler(payload: unknown): CallHandler {
  return { handle: () => of(payload) };
}

function userWith(...roles: RoleKey[]): AuthUser {
  return { userId: 'u1', username: 'u', roles };
}

describe('FinancialFieldsInterceptor', () => {
  const factory = new CaslAbilityFactory();
  const interceptor = new FinancialFieldsInterceptor(factory);

  async function run(
    user: AuthUser | undefined,
    payload: SampleTrip,
  ): Promise<SampleTrip> {
    const out = await lastValueFrom(
      interceptor.intercept(mockContext(user), mockHandler(payload)),
    );
    return out as SampleTrip;
  }

  it('strips money fields (at every depth) for an ops_staff user', async () => {
    const result = await run(userWith(RoleKey.ops_staff), sampleTrip());

    expect(result.billAmount).toBeUndefined();
    expect(result.driverPay).toBeUndefined();
    expect(result.helperPay).toBeUndefined();
    // nested relation
    expect(result.rate.clientPrice).toBeUndefined();
    expect(result.rate.driverPay).toBeUndefined();
    // nested array element
    expect(result.sub[0].billAmount).toBeUndefined();
    // non-money fields survive
    expect(result.routeLabel).toBe('Panamá → Colón');
    expect(result.driver.fullName).toBe('Mario Gomez');
    expect(result.rate.label).toBe('Std');
    expect(result.sub[0].note).toBe('extra');
  });

  it.each([RoleKey.ops_manager, RoleKey.driver])(
    'strips money fields for ops role %s',
    async (role) => {
      const result = await run(userWith(role), sampleTrip());
      expect(result.billAmount).toBeUndefined();
      expect(result.rate.clientPrice).toBeUndefined();
    },
  );

  it.each([RoleKey.finance, RoleKey.admin, RoleKey.investor])(
    'leaves money fields intact for %s',
    async (role) => {
      const result = await run(userWith(role), sampleTrip());
      expect(result.billAmount).toBe('250.00');
      expect(result.driverPay).toBe('80.00');
      expect(result.helperPay).toBe('40.00');
      expect(result.rate.clientPrice).toBe('250.00');
    },
  );

  it('does NOT strip for a finance user who is also ops', async () => {
    const result = await run(
      userWith(RoleKey.finance, RoleKey.ops_manager),
      sampleTrip(),
    );
    expect(result.billAmount).toBe('250.00');
    expect(result.rate.clientPrice).toBe('250.00');
  });

  it('strips for an anonymous (no user) request — deny by default', async () => {
    const result = await run(undefined, sampleTrip());
    expect(result.billAmount).toBeUndefined();
  });
});

describe('stripFinancialFields (pure)', () => {
  it('does not mutate the input object', () => {
    const input = sampleTrip();
    const copy: SampleTrip = JSON.parse(JSON.stringify(input)) as SampleTrip;
    stripFinancialFields(input);
    expect(input).toEqual(copy);
  });

  it('leaves Date instances untouched', () => {
    const date = new Date('2026-06-12T00:00:00.000Z');
    const out = stripFinancialFields({ createdAt: date, billAmount: '1.00' });
    expect(out.createdAt).toBe(date);
    expect(out.billAmount).toBeUndefined();
  });

  it('passes primitives through', () => {
    expect(stripFinancialFields('x')).toBe('x');
    expect(stripFinancialFields(42)).toBe(42);
    expect(stripFinancialFields(null)).toBeNull();
  });
});
