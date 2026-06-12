import { nextSeq, RateFigures, resolveTripFinancials } from './trip-financials';

describe('resolveTripFinancials', () => {
  const rate: RateFigures = {
    id: 'rate-1',
    clientPrice: 350,
    driverPay: 120,
    helperPay: 60,
  };

  it('prepopulates all money fields + rateId from the rate when nothing is given', () => {
    expect(resolveTripFinancials({}, rate)).toEqual({
      billAmount: 350,
      driverPay: 120,
      helperPay: 60,
      rateId: 'rate-1',
    });
  });

  it('lets the caller override individual money fields while keeping the rest from the rate', () => {
    expect(resolveTripFinancials({ billAmount: 400 }, rate)).toEqual({
      billAmount: 400,
      driverPay: 120,
      helperPay: 60,
      rateId: 'rate-1',
    });
  });

  it('honours an explicit zero override (0 is not treated as missing)', () => {
    expect(resolveTripFinancials({ helperPay: 0 }, rate)).toEqual({
      billAmount: 350,
      driverPay: 120,
      helperPay: 0,
      rateId: 'rate-1',
    });
  });

  it('prefers an explicit rateId over the resolved rate', () => {
    expect(resolveTripFinancials({ rateId: 'manual-rate' }, rate).rateId).toBe(
      'manual-rate',
    );
  });

  it('falls back to 0 / null when there is no rate and no override', () => {
    expect(resolveTripFinancials({}, null)).toEqual({
      billAmount: 0,
      driverPay: 0,
      helperPay: 0,
      rateId: null,
    });
  });

  it('uses caller figures when there is no rate', () => {
    expect(
      resolveTripFinancials(
        { billAmount: 200, driverPay: 80, helperPay: 40 },
        null,
      ),
    ).toEqual({
      billAmount: 200,
      driverPay: 80,
      helperPay: 40,
      rateId: null,
    });
  });
});

describe('nextSeq', () => {
  it('starts at 1 for an empty log', () => {
    expect(nextSeq([])).toBe(1);
  });

  it('returns max + 1', () => {
    expect(nextSeq([1, 2, 3])).toBe(4);
  });

  it('does not reuse gaps left by deleted trips', () => {
    expect(nextSeq([1, 3])).toBe(4);
  });

  it('is order-independent', () => {
    expect(nextSeq([3, 1, 2])).toBe(4);
  });
});
