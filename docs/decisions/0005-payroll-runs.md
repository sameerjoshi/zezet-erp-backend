# 0005 — Payroll: pay runs over periods, frozen per-trip pay lines

Date: 2026-06-16
Status: accepted

## Context

Payroll replaces the `Salarios` sheet (daily pay per worker, `Fecha inicio`/`fin`
periods). Pay is **per trip**: each `Trip` already carries `driverPay` and
`helperPay`, and `/reports/worker-pay` already sums them per worker. We need the
working module: cut a pay run for a period, see each worker's payout, mark it paid.
Mirrors Billing (ADR 0004): period → frozen lines → document → status.

## Decision

A `payroll` module, two tables:

- **`PayrollRun`** — `number` (`PAY-YYYY-NNNN`), `periodFrom`/`periodTo`,
  `status` (`draft | approved | paid | void`), `total`, `workerCount`, `paidAt?`,
  `notes?`.
- **`PayrollLine`** — a **frozen snapshot** of one worker's pay on one trip:
  `runId`, `tripId`, `workerId`, `workerName`, `role` (`driver | helper`), `date`,
  `truckCode`, `amount`. `tripId`/`workerId` are plain references (not FKs) so a
  line survives later edits — an approved run is a stable document.

Locked rules:

1. **Generate from a period**: take trips whose `dailyLog.date` ∈ `[from, to]` not
   already in a non-`void` run; for each, emit a `driver` line (driverPay) and, if a
   helper, a `helper` line (helperPay). `total` = Σ amounts, `workerCount` = distinct
   workers. Creates a **draft**.
2. **A trip is paid once** — the billable query excludes trips already on a line of a
   non-`void` run (prevents double pay across overlapping periods); voiding releases.
3. **Frozen at creation**; a draft can be deleted and regenerated.
4. **Status flow** `draft → approved → paid`; `void` from any non-paid state. Marking
   `paid` sets `paidAt`. Per-worker partial payment is deferred.
5. **Statement** = lines grouped by worker → `{ driverPay, helperPay, totalPay,
   tripCount }`. Stored as lines; the per-worker view aggregates on read (as Billing's
   detail does).
6. **Number** `PAY-{YYYY}-{NNNN}`, sequential per year, assigned in the create txn.
7. **RBAC**: new `Payroll` CASL subject — admin/finance **manage**, investor **read**,
   ops denied (financial).

## Alternatives considered

- Store per-worker aggregate rows only (no per-trip lines) — rejected: loses the
  trip-once exclusion and the drill-down statement.
- A `paid` flag on `Trip` — rejected: leaks payroll state into Operations (same
  reasoning as ADR 0004).

## Consequences

- Good: matches per-trip pay reality; stable statements; no double pay; reuses the
  worker-pay foundation. Symmetric with Billing, so one mental model.
- Cost: a run for a busy month is hundreds–thousands of lines (one per trip-role);
  acceptable, indexed by run/trip/worker.

## Rollback

Additive: two tables + one CASL subject + one module. Drop to revert; trips/reports
untouched.
