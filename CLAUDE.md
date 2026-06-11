# CLAUDE.md — Zezet ERP · Backend (NestJS)

> API for the Zezet ERP. Planning/requirements live in the repo root
> (`../../CLAUDE.md`, `../../PLAN.md`). The **data model, API surface, and acceptance criteria** are in
> `../../SPEC_Trial_Phase0-1.md` — treat it as the spec. Global `~/.claude/CLAUDE.md` applies on top.

---

## Stack
- **NestJS** + **TypeScript** (strict; no `any` without justification).
- **PostgreSQL** via **Prisma** (migrations only — never hand-edit schema/DB).
- **Redis** — refresh-token store, caching reference data, future job queues (BullMQ).
- **pnpm** (detect lockfile; don't switch package managers).
- **OpenAPI** via `@nestjs/swagger` — the spec is the contract the frontend generates its client from. Keep it accurate.

## Architecture — modular monolith, loosely coupled
Single deployable app; independent **domain modules** with strict boundaries. The point (client's explicit
ask) is to add features with **minimal disruption**.
- Each module owns its tables and exposes a public service interface (DI token). **No module reaches into
  another's internals.**
- Cross-module side effects flow through an **internal event bus** (`@nestjs/cqrs` EventBus or
  `@nestjs/event-emitter`). Example: Operations emits **`trip.created`**; Billing/Payroll modules
  *subscribe* later — Operations never imports them. This is what keeps later phases non-disruptive.
- Volatile integrations (bank import, GPS, notifications) behind ports/adapters so vendors can be swapped.

### Modules (Phase 0–1 first; later phases stubbed but designed-for)
`Identity/Auth` · `RBAC (CASL)` · `Fleet (Trucks)` · `Workforce (Workers)` · `Clients` · `Pricing (RateCards/Rates)`
· `Operations (DailyTruckLog, Trip)` · `Reporting` · `Audit`. Later: `Payroll`, `Billing/AR`, `Ledger/CostAllocation`,
`Treasury`, `BankImport`, `DriverApp/GPS`.

## Data model & rules (see SPEC §4 for the full schema)
- **Trip is the universal record**: `clientId, billAmount, driverWorkerId, helperWorkerId?, driverPay, helperPay,
  rateId?` under a `DailyTruckLog (date, truckId, fuel, odometer)`. **No trips/day cap.**
- **Worker**: single pool, `type: employee|contractor`, `canDrive/canHelp`; same person can be driver or helper,
  even same day. Optional `userId` (for future driver login).
- **Pricing**: rate lookup prepopulates trip charge + driver/helper pay; **all editable** per trip.
- **Billing periods** are client-driven and **irregular** → support arbitrary from/to date queries.
- Prefer **status/soft-delete** over hard delete (preserve context). USD only.
- Validation rule of thumb: **warn, don't block** (odometer regressions etc.) — the data is messy by nature.

## Auth & permissions
- **JWT** access + refresh; refresh stored in **Redis** (revocable). Passwords hashed (argon2/bcrypt).
- **Generated usernames**; email/phone optional/nullable.
- **CASL** abilities keyed off roles (`admin, finance, ops_manager, ops_staff, driver, investor`). Enforce
  **field-level financial gating** — operations roles must never receive `billAmount`/pay/financial reports.
  This is a hard requirement, not cosmetic.

## Conventions
- Layering: controller → service → repository (Prisma). Validate input at the boundary with **class-validator** DTOs.
- Never swallow errors; convert to typed domain errors + proper HTTP responses. Explicit handling on every failure path.
- **Audit log** every create/update/delete (actor, entity, before/after) via an interceptor.
- Transactions for multi-step writes; avoid N+1; index by real query patterns (justify with EXPLAIN as data grows).
- i18n: API returns **stable codes / neutral data**; the frontend renders EN/ES strings.
- Idempotency + backoff for any external/webhook/queue work (bank import, later phases).
- No AI/Claude signatures in code or commits. Tests before "done" (Jest unit, Supertest e2e on key flows).

## Trial scope (Phase 0–1)
Auth + RBAC + EN/ES-ready + audit + master data (Trucks/Workers/Clients/RateCards) + Operations
(daily-log/trip CRUD with rate prepopulation, validations, derived totals, `trip.created` event) +
role-gated Phase-1 reports. See SPEC §7 (10-day plan) and §8 (acceptance criteria).
