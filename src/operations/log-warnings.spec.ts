import { computeLogWarnings } from './log-warnings';

describe('computeLogWarnings', () => {
  it('returns no warnings when everything is consistent', () => {
    expect(
      computeLogWarnings({
        odometerStart: 100,
        odometerEnd: 250,
        previousOdometerEnd: 100,
        tripCount: 2,
        confirming: true,
      }),
    ).toEqual([]);
  });

  it('warns when odometer end is less than start', () => {
    const warnings = computeLogWarnings({
      odometerStart: 300,
      odometerEnd: 250,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Odometer end (250)');
    expect(warnings[0]).toContain('start (300)');
  });

  it("warns when start regresses below the previous log's end", () => {
    const warnings = computeLogWarnings({
      odometerStart: 90,
      previousOdometerEnd: 120,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Odometer start (90)');
    expect(warnings[0]).toContain("previous log's end (120)");
  });

  it('warns when confirming a log with zero trips', () => {
    const warnings = computeLogWarnings({ confirming: true, tripCount: 0 });
    expect(warnings).toEqual([
      'Confirming a daily log with no trips recorded.',
    ]);
  });

  it('does not warn about empty trips when not confirming', () => {
    expect(computeLogWarnings({ confirming: false, tripCount: 0 })).toEqual([]);
  });

  it('does not warn on equal odometer boundaries (inclusive)', () => {
    expect(
      computeLogWarnings({
        odometerStart: 100,
        odometerEnd: 100,
        previousOdometerEnd: 100,
      }),
    ).toEqual([]);
  });

  it('ignores odometer checks when readings are missing (null/undefined)', () => {
    expect(
      computeLogWarnings({ odometerStart: null, odometerEnd: null }),
    ).toEqual([]);
    expect(computeLogWarnings({})).toEqual([]);
  });

  it('can return multiple warnings together in a stable order', () => {
    const warnings = computeLogWarnings({
      odometerStart: 90,
      odometerEnd: 80,
      previousOdometerEnd: 120,
      tripCount: 0,
      confirming: true,
    });
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('Odometer end');
    expect(warnings[1]).toContain('Odometer start');
    expect(warnings[2]).toContain('no trips');
  });
});
