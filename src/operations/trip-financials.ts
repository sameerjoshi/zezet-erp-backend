// Pure, Prisma-free helpers for prepopulating a Trip's money fields from an
// effective Rate and for computing the next sequence number within a log.
// Kept here so the override/seq rules are unit-testable without a database.

// The three money figures a Rate contributes to a trip, as plain numbers.
export interface RateFigures {
  id: string;
  clientPrice: number;
  driverPay: number;
  helperPay: number;
}

// Caller-supplied overrides. Any field left `undefined` falls back to the rate;
// an explicit `0` is honoured (it is not nullish), so a caller can deliberately
// zero out a figure even when a rate exists.
export interface TripFinancialOverrides {
  billAmount?: number;
  driverPay?: number;
  helperPay?: number;
  rateId?: string;
}

export interface ResolvedTripFinancials {
  billAmount: number;
  driverPay: number;
  helperPay: number;
  rateId: string | null;
}

// Resolve a trip's money + rate link: caller override wins, else the effective
// rate prepopulates, else 0. `rateId` is the explicit override, else the
// selected rate's id, else null (manual entry with no rate on file).
export function resolveTripFinancials(
  overrides: TripFinancialOverrides,
  rate: RateFigures | null,
): ResolvedTripFinancials {
  return {
    billAmount: overrides.billAmount ?? rate?.clientPrice ?? 0,
    driverPay: overrides.driverPay ?? rate?.driverPay ?? 0,
    helperPay: overrides.helperPay ?? rate?.helperPay ?? 0,
    rateId: overrides.rateId ?? rate?.id ?? null,
  };
}

// Next per-log sequence number: one above the current maximum (1 when empty).
// Gaps left by deleted trips are intentionally NOT reused — seq stays monotonic.
export function nextSeq(existingSeqs: readonly number[]): number {
  return existingSeqs.reduce((max, s) => (s > max ? s : max), 0) + 1;
}
