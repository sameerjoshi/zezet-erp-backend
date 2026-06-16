# 0004 — Billing / AR: invoices over client-driven periods

Date: 2026-06-16
Status: accepted

## Context

Billing replaces the `Facturas` sheet. The locked model (PROPOSAL §13): billing is
**not** tied truck↔client, and periods are **irregular, client-driven** (arbitrary
from/to). The owner today picks a client + a date window, sums the trip charges into
a `Monto`, and issues that as an invoice. The `Trip` is the universal record and
already carries the per-trip charge; `/reports/client-billables` already sums it.

## Decision

A `billing` module with two tables:

- **`Invoice`** — `clientId`, `periodFrom`/`periodTo` (the arbitrary window),
  `number` (unique), `status` (`draft | sent | paid | void`), `issueDate`,
  `total` (Decimal), `amountPaid` (Decimal, default 0), `paidAt?`, `notes?`.
- **`InvoiceLine`** — a **frozen snapshot** of one billed trip: `invoiceId`, `tripId`,
  `date`, `truckCode`, `routeLabel`, `billAmount`. Snapshotting means later edits to a
  trip never silently change an issued invoice.

Locked rules:

1. **Generate from client + period**: pull that client's trips whose `dailyLog.date`
   is in `[from, to]`, snapshot each as an `InvoiceLine`, set `total` = sum. Creates a
   **draft**.
2. **A trip is billed once.** The billable query excludes trips already on a line of a
   non-`void` invoice; generation runs in a transaction. (No DB-unique on `tripId` so a
   voided invoice naturally releases its trips.)
3. **Frozen at creation.** Draft lines are the snapshot; a draft can be deleted and
   regenerated. Once `sent`, the invoice is immutable except status/payment.
4. **Status flow** `draft → sent → paid`; `void` from any non-paid state. Marking paid
   sets `amountPaid = total` + `paidAt` (full payment only for MVP).
5. **Invoice number** `INV-{YYYY}-{NNNN}`, sequential within the year, assigned at
   creation inside the transaction.
6. **AR aging**: unpaid `sent` invoices bucketed by age from `issueDate`
   (current / 1–30 / 31–60 / 60+), grouped per client.
7. **RBAC**: new `Invoice` CASL subject — admin/finance **manage**, investor **read**;
   ops roles get nothing (it is financial). Reuses the global financial gate.

## Alternatives considered

- Compute invoices on the fly from trips (no stored lines) — rejected: an issued
  invoice must be a stable document even if trips are later edited/deleted.
- Per-trip `invoiced` flag on `Trip` — rejected: leaks billing state into Operations;
  the line-snapshot + exclusion query keeps the concern in `billing`.
- Partial payments / payment ledger — deferred; `amountPaid` is stored now so it is a
  small additive change later.

## Consequences

- Good: matches how the owner already invoices; stable documents; double-billing
  prevented; AR visibility (aging) which was an open question.
- Cost: voiding releases trips by excluding void invoices in the billable query (lines
  kept for audit). Number sequence is per-year and DB-transaction guarded.
- Panama DGI e-invoicing remains **deferred** (no fiscal/CUFE integration here).

## Rollback

Additive: two new tables + one CASL subject + one module. Drop them to revert; trips
and reports are untouched.
