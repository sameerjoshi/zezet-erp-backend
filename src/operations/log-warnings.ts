// Pure, Prisma-free warning logic for a DailyTruckLog so it is trivially
// unit-testable. Per the spec these are NON-BLOCKING: the caller still saves the
// log/trip and surfaces the warnings in the response payload. Hard errors are
// reserved for referential integrity and the unique [date, truckId] constraint.
export interface LogWarningInput {
  // Odometer reading at the start of the day.
  odometerStart?: number | null;
  // Odometer reading at the end of the day.
  odometerEnd?: number | null;
  // The most recent prior log's odometerEnd for the same truck (if any).
  previousOdometerEnd?: number | null;
  // Number of trips currently recorded under the log.
  tripCount?: number;
  // True only when the call is confirming the log (draft → confirmed).
  confirming?: boolean;
}

// Returns human-readable warnings for the given odometer/trip state. Empty when
// nothing is off. Order is stable (end<start, then start<previous, then
// zero-trip confirm) so tests and the UI render predictably.
export function computeLogWarnings(input: LogWarningInput): string[] {
  const warnings: string[] = [];
  const {
    odometerStart,
    odometerEnd,
    previousOdometerEnd,
    tripCount,
    confirming,
  } = input;

  if (
    odometerStart != null &&
    odometerEnd != null &&
    odometerEnd < odometerStart
  ) {
    warnings.push(
      `Odometer end (${odometerEnd}) is less than odometer start ` +
        `(${odometerStart}).`,
    );
  }

  if (
    odometerStart != null &&
    previousOdometerEnd != null &&
    odometerStart < previousOdometerEnd
  ) {
    warnings.push(
      `Odometer start (${odometerStart}) is less than the previous log's ` +
        `end (${previousOdometerEnd}).`,
    );
  }

  if (confirming && (tripCount ?? 0) === 0) {
    warnings.push('Confirming a daily log with no trips recorded.');
  }

  return warnings;
}
