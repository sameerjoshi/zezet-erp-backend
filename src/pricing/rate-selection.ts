// Pure effective-rate selection — kept free of Prisma/Nest so it is trivially
// unit-testable. A rate is "active at `at`" when its window contains `at`:
//   effectiveFrom <= at  AND  (effectiveTo is null OR effectiveTo >= at)
// Among the active rates, the one with the most recent `effectiveFrom` wins
// (a newer rate supersedes an older overlapping one). Ties keep the first
// encountered — callers that care about tie order should pre-sort.
export interface EffectiveDated {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function selectEffectiveRate<T extends EffectiveDated>(
  rates: readonly T[],
  at: Date,
): T | null {
  const now = at.getTime();
  const active = rates.filter(
    (r) =>
      r.effectiveFrom.getTime() <= now &&
      (r.effectiveTo === null || r.effectiveTo.getTime() >= now),
  );
  if (active.length === 0) {
    return null;
  }
  return active.reduce((best, cur) =>
    cur.effectiveFrom.getTime() > best.effectiveFrom.getTime() ? cur : best,
  );
}
