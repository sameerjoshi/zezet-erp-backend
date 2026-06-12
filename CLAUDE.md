# CLAUDE.md — Zezet ERP · Backend (NestJS)

API for the **Zezet ERP** — a custom, single-tenant ERP for **Zezet** (zezet.net), a trucking/logistics
company in **Panama**, replacing a legacy Excel workbook. Built modular and loosely coupled so features
can be added with minimal disruption. Languages: English + Spanish (the API stays language-neutral).
Currency: USD.

The frontend is a separate repo (`zezet-erp-frontend`). The two share types via **OpenAPI codegen** —
this API's Swagger spec (`/docs`) is the contract the frontend generates its client from. Keep it accurate.

---

## Domain in one paragraph
A fleet (~38 trucks, growing) runs daily **trips ("tournos")** for clients. Drivers + helpers (a mix of
employees and contractors) are paid **per trip**. Client billing happens in irregular, client-driven
periods. The **Trip is the universal record** — it carries the client, the charge, the driver/helper and
their pay, and feeds both payroll and billing later. Audience for the product: operators with low software
familiarity → keep behaviour simple and forgiving (warnings, not hard blocks).

## Stack
- **NestJS** + **TypeScript** (strict; no `any` without justification).
- **PostgreSQL** via **Prisma** (currently pinned to **v6**; migrations only — never hand-edit schema/DB).
- **Redis** — refresh-token store, caching reference data, future job queues (BullMQ).
- **pnpm** (detect lockfile; don't switch package managers). Native build approvals live in `pnpm-workspace.yaml`.
- **OpenAPI** via `@nestjs/swagger` — served at `/docs`.

## Local setup
```bash
pnpm install
cp .env.example .env          # DATABASE_URL, REDIS_URL, JWT secrets, CORS_ORIGIN
pnpm infra:up                 # docker compose: PostgreSQL 16 + Redis 7
pnpm db:migrate               # apply migrations
pnpm start:dev                # API on :3001, docs at /docs
```

## Architecture — modular monolith, loosely coupled
Single deployable app; independent **domain modules** with strict boundaries. The goal is to add features
with **minimal disruption**.
- Each module owns its tables and exposes a public service interface (DI token). **No module reaches into
  another's internals.**
- Cross-module side effects flow through an **internal event bus** (`@nestjs/event-emitter`, already wired
  in `app.module.ts`). Example: Operations emits **`trip.created`**; Billing/Payroll modules *subscribe*
  later — Operations never imports them. This is what keeps later phases non-disruptive.
- Volatile integrations (bank import, GPS, notifications) sit behind ports/adapters so vendors can be swapped.

### Modules (Phase 0–1 first; later phases designed-for, not yet built)
`Identity/Auth` · `RBAC (CASL)` · `Fleet (Trucks)` · `Workforce (Workers)` · `Clients` · `Pricing (RateCards/Rates)`
· `Operations (DailyTruckLog, Trip)` · `Reporting` · `Audit`.
Later: `Payroll`, `Billing/AR`, `Ledger/CostAllocation`, `Treasury`, `BankImport`, `DriverApp/GPS`.

## Data model & rules
The schema is **`prisma/schema.prisma`** (the source of truth for the data model). Key rules:
- **Trip is the universal record**: `clientId, billAmount, driverWorkerId, helperWorkerId?, driverPay,
  helperPay, rateId?` under a `DailyTruckLog (date, truckId, fuel, odometer)`. **No trips/day cap.**
- **Worker**: single pool, `type: employee|contractor`, `canDrive/canHelp`; the same person can be driver
  or helper, even on the same day. Optional `userId` (for future driver login).
- **Pricing**: a rate lookup prepopulates a trip's charge + driver/helper pay; **all values editable** per trip.
- **Billing periods** are client-driven and **irregular** → support arbitrary from/to date queries.
- Prefer **status / soft-delete** over hard delete (preserve context). USD only.
- Validation rule of thumb: **warn, don't block** (e.g. odometer regressions) — the data is messy by nature.

## Auth & permissions
- **JWT** access + refresh; refresh stored in **Redis** (revocable). Passwords hashed (argon2).
- **Refresh token lives in an httpOnly cookie**, not the response body; access token is returned in the body
  and held in frontend memory. See `docs/decisions/0001-refresh-token-httponly-cookie.md` (the settled
  contract — login sets cookie, refresh reads cookie + rotates, logout clears it). CORS must use the
  **explicit** `CORS_ORIGIN` (never `*`) since credentials are enabled.
- **Generated usernames**; email/phone optional/nullable.
- **CASL** abilities keyed off roles (`admin, finance, ops_manager, ops_staff, driver, investor`). Enforce
  **field-level financial gating** — operations roles must never receive `billAmount`/pay/financial reports.
  This is a hard product requirement, not cosmetic.

## Conventions
- Layering: controller → service → repository (Prisma). Validate input at the boundary with **class-validator** DTOs.
- Never swallow errors; convert to typed domain errors + proper HTTP responses. Explicit handling on every failure path.
- **Audit log** every create/update/delete (actor, entity, before/after) via an interceptor.
- Transactions for multi-step writes; avoid N+1; index by real query patterns (justify with EXPLAIN as data grows).
- The API returns **stable codes / neutral data**; the frontend renders EN/ES strings.
- Idempotency + backoff for any external/webhook/queue work (bank import, later phases).
- Write clear, obvious code; document the WHY. **No AI-assistant signatures** in code or commits.
- Test before "done" (Jest unit, Supertest e2e on key flows).

## Working rhythm & handoff (READ THIS)
Work **one TASKS.md item at a time**: plan briefly → implement → verify (build + relevant tests) →
tick the box → commit. Keep `TASKS.md`, `DEVLOG.md`, and the code in the **same commit**.

**Maintain `DEVLOG.md`** — it's the handoff the planning/review session reads, so comms don't depend on
chat. After each task (or any notable change), add a dated entry at the **top** with:
- **What changed** (1–4 bullets)
- **Decisions / deviations** — anything not obvious from the diff (version pins, port changes, defaults,
  trade-offs). Operational facts a reviewer must know go here, e.g. local Postgres host port, dev seed
  password default, why a dependency was pinned.
- **Gotchas / risks** — things to fix before real deployment, or that could bite the next task.
- **Next** — the next unchecked TASKS.md item.

Keep entries short and skimmable. This file is the single place the hub checks to review progress and
decide what's next — treat it as the source of truth for "where the backend is."

## Trial scope (Phase 0–1)
Auth + RBAC + EN/ES-ready + audit + master data (Trucks/Workers/Clients/RateCards) + Operations
(daily-log/trip CRUD with rate prepopulation, validations, derived totals, the `trip.created` event) +
role-gated Phase-1 reports.

Acceptance highlights: app builds & runs; ops roles provably can't see financial fields/reports; daily trip
entry works (date → truck → multiple trips, no cap, rate prepopulation that stays editable, driver+helper,
fuel, odometer) with audit; one-command local setup (docker compose) + migrations/seed.
