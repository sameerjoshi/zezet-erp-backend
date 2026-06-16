# 0007 — Treasury: accounts + cash ledger

Date: 2026-06-16
Status: accepted

## Context

Replaces `Movimientos` (the categorized cash ledger with running balance + per-truck
allocation), `Cash flow` (accounts and balances) and `Balance` (category totals). The
owner tracks money across several accounts (St Georges Bank, Caja de Ahorros, Cuenta
Jorge, cash) with categorized in/out movements, some allocated to a truck.

## Decision

A `treasury` module, two tables:

- **`BankAccount`** — `name`, `kind` (`bank | cash`), `openingBalance`, `status`.
  Current balance = openingBalance + Σ inflows − Σ outflows (computed, not stored).
- **`Transaction`** — `accountId`, `date`, `direction` (`inflow | outflow`), `amount`
  (always positive; direction signs it), `category` (`TxCategory`), `description`,
  `truckId?` (optional allocation, plain ref), `note?`.

Categories (flat; direction carries in/out): `client_payment | investment | loan |
fuel | salary | maintenance | toll | insurance | tax | general | transfer | other`.

Endpoints:
- `GET /treasury/accounts` → accounts **with live balance**; `POST`/`PATCH`/`DELETE`.
- `GET /treasury/transactions?accountId&from&to&category` (ledger) + `POST` + `DELETE`.
- `GET /treasury/cash-position` → balance per account + grand total.

RBAC: new `Treasury` CASL subject — admin/finance **manage**, investor **read**, ops
denied (financial).

## Scope / deferred

- **Manual ledger only for now.** Auto-posting (marking an Invoice paid → an inflow,
  a PayrollRun paid → an outflow, a TruckCost → an outflow) is a natural event-bus
  follow-up but **deferred** to avoid coupling; flagged for later.
- Per-row running balance is computed client-side when viewing one account; the
  authoritative number is the per-account current balance from `/accounts`.
- Bank-statement import + reconciliation, multi-currency, investor/capital schedule
  (`Plan financiero`) — deferred.

## Alternatives considered

- Double-entry accounting (debits=credits across accounts) — rejected as overkill for
  this single-tenant cash view; a signed single-entry ledger matches `Movimientos`.

## Consequences

- Good: real cash position across accounts; categorized history; truck allocation hook
  for cost attribution. Honest single-entry model the owner already uses.
- Cost: no auto-reconciliation with Billing/Payroll yet (manual double-keying until the
  auto-post follow-up).

## Rollback

Additive: two tables + one CASL subject + one module. Drop to revert.
