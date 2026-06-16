# 0006 — Per-truck cost tracking + profit & loss

Date: 2026-06-16
Status: accepted

## Context

Replaces the `Analisis` "Beneficio mensual" view and the cost rows in `Data2025/26`
(`Mantenimiento`, `Autopista`/tolls, etc.). The owner watches **profit per truck**:
revenue − fuel − driver/helper pay − other costs. Revenue (trip charges), fuel
(`DailyTruckLog.fuelCost`) and pay (trip driver/helper pay) are already captured.
What's missing is the **other per-truck costs** (maintenance, tolls, insurance, tax,
repairs) and the P&L roll-up that combines them.

## Decision

- **`TruckCost`** table: `truckId`, `date`, `category` (`CostCategory`), `amount`,
  `note?`. A lumpy cost (a repair) is recorded on the day it occurs, against the truck.
  Categories: `maintenance | toll | insurance | tax | repair | other`. Fuel and pay are
  **not** here — they already live on logs/trips; the P&L pulls them from there.
- **`GET /reports/truck-pnl?from&to`** — per truck over the range:
  `revenue, fuel, driverPay, helperPay, costs, profit` where
  `profit = revenue − fuel − driverPay − helperPay − costs`, plus a fleet totals row.
- **RBAC**: a new `Cost` CASL subject — admin/finance **manage** TruckCost (entering a
  cost is a money action), investor **read**, ops denied. The P&L report stays on the
  existing `Report` subject (finance/admin/investor).

Costs are entered by finance (amounts are money, gated from ops). The operational
"why a truck was idle" already lives in `operStatus` (ADR 0003: a `broken` day); the
matching repair *cost* is recorded here.

## Alternatives considered

- Put `maintenanceCost`/`tollCost` columns on `DailyTruckLog` — rejected: costs are not
  one-per-day-per-category and ops shouldn't see/enter money on the log. A separate
  categorized table is more honest and extends toward Treasury (#4).
- Compute amortization/depreciation into profit now — deferred; `purchasePrice` +
  `purchaseDate` are stored, so it's an additive read-side change later.

## Consequences

- Good: real per-truck P&L; categorized costs reusable by Treasury; clean separation of
  ops vs finance.
- Cost: profit excludes amortization for now (cash-cost profit, not accounting profit) —
  documented; can be layered in later.

## Rollback

Additive: one table + one CASL subject + one module + one report endpoint. Drop to
revert; trips/logs/reports untouched.
