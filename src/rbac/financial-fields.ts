// The money fields that operations roles must never receive in a response
// (HARD requirement — see CaslAbilityFactory + FinancialFieldsInterceptor).
//
// Keep this list authoritative: any new monetary column added to the schema
// MUST be added here so the field-level gate strips it for ops roles.
//   - billAmount  : Trip charge to the client
//   - driverPay   : Trip driver compensation (also a Rate price)
//   - helperPay   : Trip helper compensation (also a Rate price)
//   - clientPrice : Rate client price
//   - purchasePrice: Truck acquisition cost
//   - fuelCost    : DailyTruckLog fuel cost
//   - totalPay    : Reporting-derived worker pay total (driverPay + helperPay)
export const FINANCIAL_FIELDS: readonly string[] = [
  'billAmount',
  'driverPay',
  'helperPay',
  'clientPrice',
  'purchasePrice',
  'fuelCost',
  'totalPay',
] as const;

// Fast-lookup form used by the recursive stripper.
export const FINANCIAL_FIELD_SET: ReadonlySet<string> = new Set(
  FINANCIAL_FIELDS,
);
