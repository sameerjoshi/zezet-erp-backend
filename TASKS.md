# TASKS — Zezet ERP Backend (Phase 0–1 / trial)

Working backlog for **this repo**. Read `CLAUDE.md` first for stack, architecture, and conventions.
Check items off as you complete them and commit the change — this file is the live status for the backend.
Status: ⬜ todo · 🟡 in progress · ✅ done · ⛔ blocked.

> Scaffold is done: app builds, `prisma/schema.prisma` holds the Phase 0–1 model, docker-compose +
> Swagger (`/docs`) + ConfigModule + event bus + PrismaModule are wired.

---

## 0 · Bootstrap data layer  ✅
- [x] `pnpm infra:up` (Postgres + Redis), then `pnpm db:migrate` — turn the schema into real tables
- [x] Seed script: roles (`admin, finance, ops_manager, ops_staff, driver, investor`) + a sample admin user
- [x] CI: lint / typecheck / test on push

## 1 · Authentication  🟡
- [ ] Password hashing (argon2); **generated usernames**; email/phone optional
      <!-- argon2 verify on login ✅ + email/phone already optional in schema ✅;
           username *generation* deferred to §2 (no create-user endpoint exists yet). -->
- [x] JWT **access + refresh**; refresh stored in **Redis** (revocable)
- [x] `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`
- [x] e2e tests on the auth flow
- [x] **Refactor refresh to httpOnly cookie** (ADR 0001) — login sets cookie; refresh reads cookie (drop
      body param) + rotates + sets new cookie; logout clears it; access token stays in body. Add
      `cookie-parser`; make CORS use explicit `CORS_ORIGIN` (not `*`). Update the e2e to use the cookie jar.
      **Do this before the frontend builds auth.**

### 1b · Auth hardening (before deploy, not blocking frontend)  ⬜
- [ ] Rate-limit `/auth/login` (`@nestjs/throttler`) — brute-force defense
- [ ] Env-var schema validation at boot (Joi/Zod) so missing `JWT_*` fails fast, not lazily
- [ ] Document that logout revokes refresh only; the current access token lives until its TTL (≤15m)

## 2 · RBAC + Audit  ⬜
- [ ] **CASL** abilities keyed off roles; Users/Roles endpoints (admin)
- [ ] **Field-level financial gating** — ops roles never receive `billAmount`/pay/financial reports (hard requirement)
- [ ] Audit-log interceptor (actor, entity, before/after) on every create/update/delete

## 3 · Master data  ⬜
- [ ] **Fleet (Trucks)** — CRUD + validation
- [ ] **Workforce (Workers)** — `type: employee|contractor`, `canDrive/canHelp`; CRUD
- [ ] **Clients** — CRUD
- [ ] Seed representative data

## 4 · Pricing  ⬜
- [ ] RateCards / Rates CRUD
- [ ] `GET /rates/lookup?clientId=&route=` — prepopulation source (charge + driver/helper pay)

## 5 · Operations (the universal record)  ⬜
- [ ] `DailyTruckLog` + `Trip` CRUD — **no trips/day cap**
- [ ] Rate prepopulation on trip create (**all values stay editable**)
- [ ] Validations: **warn, don't block** (odometer regressions, etc.); active-truck / valid-worker checks
- [ ] Derived totals queries (trips, utilization, worker pay, client billables)
- [ ] Emit **`trip.created`** domain event (so Billing/Payroll can subscribe later)
- [ ] e2e tests on the trip flow

## 6 · Reporting  ⬜
- [ ] Role-gated Phase-1 reports: trips · utilization · worker-pay · client-billables

## Always
- [ ] Keep the **OpenAPI/Swagger spec accurate** — it's the contract the frontend's client is generated from
- [ ] Migrations only (never hand-edit DB); explicit error handling; tests before "done"

---
**Out of scope this phase:** Payroll, Billing/AR, Ledger/cost-allocation, Treasury, BankImport, DriverApp/GPS
(designed-for in the schema + event bus, built in later phases).
