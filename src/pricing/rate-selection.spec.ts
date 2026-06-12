import { EffectiveDated, selectEffectiveRate } from './rate-selection';

// Tag rates with an id so the test can assert *which* one was chosen.
type Rate = EffectiveDated & { id: string };

const d = (iso: string): Date => new Date(iso);

describe('selectEffectiveRate', () => {
  const now = d('2026-06-12T00:00:00Z');

  it('returns null when there are no rates', () => {
    expect(selectEffectiveRate([], now)).toBeNull();
  });

  it('returns null when every rate is out of its effective window', () => {
    const rates: Rate[] = [
      { id: 'future', effectiveFrom: d('2026-07-01'), effectiveTo: null },
      {
        id: 'expired',
        effectiveFrom: d('2026-01-01'),
        effectiveTo: d('2026-03-01'),
      },
    ];
    expect(selectEffectiveRate(rates, now)).toBeNull();
  });

  it('picks an open-ended rate whose effectiveFrom is in the past', () => {
    const rates: Rate[] = [
      { id: 'r1', effectiveFrom: d('2026-01-01'), effectiveTo: null },
    ];
    expect(selectEffectiveRate(rates, now)?.id).toBe('r1');
  });

  it('prefers the most recent effectiveFrom among overlapping active rates', () => {
    const rates: Rate[] = [
      { id: 'old', effectiveFrom: d('2026-01-01'), effectiveTo: null },
      { id: 'new', effectiveFrom: d('2026-06-01'), effectiveTo: null },
      { id: 'older', effectiveFrom: d('2025-01-01'), effectiveTo: null },
    ];
    expect(selectEffectiveRate(rates, now)?.id).toBe('new');
  });

  it('respects a closed effectiveTo window (inclusive bounds)', () => {
    const rates: Rate[] = [
      {
        id: 'bounded',
        effectiveFrom: d('2026-06-01'),
        effectiveTo: d('2026-06-12T00:00:00Z'),
      },
    ];
    // `now` equals effectiveTo exactly → still active (>= is inclusive).
    expect(selectEffectiveRate(rates, now)?.id).toBe('bounded');
  });

  it('includes a rate whose effectiveFrom equals now (inclusive lower bound)', () => {
    const rates: Rate[] = [
      { id: 'starts-now', effectiveFrom: now, effectiveTo: null },
    ];
    // effectiveFrom <= now is inclusive → active.
    expect(selectEffectiveRate(rates, now)?.id).toBe('starts-now');
  });
});
