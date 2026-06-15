# DEVLOG — Zezet ERP Backend

Dev log. Newest entry on top. One entry per task / notable change.
Format per entry: **What changed · Decisions/deviations · Gotchas/risks · Next.**

---

## 2026-06-15 · Operational status + in-service date + operating % ✅
**What changed**
- Schema: `OperStatus { operating | no_clients | broken }` enum + nullable `DailyTruckLog.operStatus`; `Truck.inServiceDate @db.Date`. Hand-written migration `20260615120000_operational_status` (applied via `migrate deploy`) backfills trip-bearing logs to `operating` and seeds `inServiceDate` from `purchaseDate`.
- DTOs/service: `operStatus` on create/update daily-log + responses + the dashboard summary rows; `inServiceDate` on truck create/update/response.
- Reporting: `aggregateOperational` (pure) + `GET /reports/operational` → per-day & total operating/no_clients/broken counts and `operatingPct = operating / recorded` (recorded = non-null statuses only).
- import-history.ts now stamps imported logs `operating`.

**Decisions:** ADR 0003. operStatus is orthogonal to LogStatus (a day can be confirmed AND broken). Null = not expected → excluded from %, which is how Xavier's sheet leaves Sundays blank.

**Gotchas:** historical data has only operating statuses, so past operating % reads ~100% until idle/broken are recorded going forward. Migration was hand-authored (no local shadow DB) — kept the SQL minimal/idempotent-safe.

**Next:** sales-vs-mechanics accountability reports; optional per-truck operational history endpoint.

## 2026-06-15 · Historical data import from legacy workbook ✅
**What changed**
- **`tools/parse-history-xlsx.py`** — parses `Camion_con_Jorge.xlsx` into clean JSON. The `Tournos` sheet is the only per-trip source (pivoted: trucks across columns, 2 cols each; per-date 14-row blocks; up to 3 trips/truck/day as `Tournos/Conductor/Ayudante 1..3`; fuel on `Combustible`). `Inventarios` → trucks. Emits trucks/clients/workers/logs(+trips) + a `meta` block with per-month trip counts for cross-check.
- **`prisma/import-history.ts`** — loads that JSON via Prisma. Masters upsert by natural key (truck.code, client.code) or find-or-create by name (workers, single interchangeable pool canDrive+canHelp). Operational data is **wiped within the imported date range then reinserted** → idempotent. Historical logs marked `confirmed`.

**Decisions/deviations**
- True per-trip migration only possible **2026-01-26 → 2026-06-08** (`Tournos`); everything earlier is dollar aggregates (`Data2025/2026`, `Analisis`) → not imported as trips. Recon written to hub `transcripts/_EXCEL_MIGRATION_RECON.md`.
- Odometer not recorded per day in the sheet → `DailyTruckLog.odometer*` left null; truck `odometerStart` seeded from Inventarios. Fuel is per-truck-day → on the log, not the trip (matches schema).
- Parsed JSON holds **real client financials → gitignored** (`prisma/.history-import.json`), generated locally, scp'd to the host, run there. Never committed.

**Result (demo DB):** 39 trucks, 8 clients (TLA+Grupo Rey ≈ 99% of volume), 155 workers, 2,152 logs, 2,283 trips. May billables $142,987.63 vs Analisis $143,499 (~0.4%).

**Gotchas/risks**
- Parser trip counts run ~7-9% above the `Analisis` "Tournos total" formula (likely a stricter definition there); shape matches. Acceptable for the demo, revisit if exact reconciliation is required for go-live.
- Re-running the importer re-wipes 2026-01-26..06-08 logs (incl. any UI-entered test trips in that window).

**Next:** decide pricing direction (Xavier Q1) before building rate cards from history; consider importing 2025/early-Jan aggregate $ as a separate non-trip history if the dashboard needs deeper trend lines.

## 2026-06-12 · Section 5 — Reporting + Auth hardening ✅
**What changed**
- **`src/reporting/*`** — new `ReportingController` (`@Controller('reports')`, `@UseGuards(JwtAuthGuard, PoliciesGuard)`, controller-level `@RequireAbility(Read, 'Report')`) + `ReportingService`. All math is in pure `src/reporting/reporting.aggregate.ts` (no I/O → unit-testable); the service fetches trip rows (trips joined through `dailyLog.date`/`truck`/`client`/`driver`/`helper`) and folds them. Endpoints take an **inclusive** `?from=&to=` (ISO `YYYY-MM-DD`):
  - `GET /reports/trips` → `{ from, to, totalTrips, perDay:[{date,tripCount}], perTruck:[{truckId,truckCode,tripCount}] }`.
  - `GET /reports/utilization` → `{ from, to, perDay:[{date,activeTrucks,trucksWithTrips,utilization}] }`. `utilization` = trucksWithTrips ÷ activeTrucks (0..1 number, 4-dp; 0 when no active trucks). Every day in the range is present (incl. zero-trip days).
  - `GET /reports/worker-pay` → `{ from, to, workers:[{workerId,workerName,driverPay,helperPay,totalPay}] }` (money; sorted by totalPay desc). A worker accrues `driverPay` on trips driven + `helperPay` on trips helped.
  - `GET /reports/client-billables` → `{ from, to, clients:[{clientId,clientName,tripCount,billAmount}] }` (money; sorted by billAmount desc).
- **Role gating** — `Report` subject ⇒ ops_manager/ops_staff/driver get **403** (CASL `cannot Read Report`); only admin/finance/investor read. Money reports also pass the global financial gate, but every `Report` reader can also `Read Financial`, so figures are returned to them intact. Added **`totalPay`** to `FINANCIAL_FIELDS` (defence-in-depth on the derived total).
- **Date range** — `from`/`to` optional (`IsDateString`); default = trailing **30-day** window (`to`=today UTC, `from`=`to`−29d). Inverted range → 400; range > 366 days → 400.
- **Auth hardening** — (1) **Throttle** `POST /auth/login` + `/auth/refresh` at **10 req / 60s / IP** via `@nestjs/throttler` (`ThrottlerModule.forRoot` in AppModule, `@UseGuards(ThrottlerGuard)` narrowly on the two routes — rest of API unthrottled; `ThrottlerGuard` runs before auth so it 429s regardless of credentials). (2) **Boot-time env validation** — `ConfigModule.forRoot({ validationSchema })` with Joi (`src/config/env.validation.ts`) asserts `DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_TTL, JWT_REFRESH_TTL, CORS_ORIGIN`; `allowUnknown: true` lets PORT/NODE_ENV/SEED_* through. Missing/garbage var now crashes startup. (3) **ADR 0002** — logout revokes refresh only; the access token lives out its ≤15m TTL.
- **Deps** — `@nestjs/throttler@6.5.0`, `joi@18.2.1` (lockfile updated).
- **Tests** — unit `src/reporting/reporting.aggregate.spec.ts` (per-day/per-truck counts, utilization incl. dedupe + zero-truck divide-by-zero, worker-pay driver+helper split, client billables). e2e `test/reporting.e2e-spec.ts` (admin gets each report shape WITH money: worker driverPay 240, helper 120, client bill 800, truck tripCount 2, utilization 31-day window; ops 403 on all four; inverted range 400) + `test/auth-throttle.e2e-spec.ts` (11th login → 429). **Full DoD green**: lint, lint:ci, build, **61 unit**, **39 e2e**.

**Decisions / deviations**
- **e2e now runs in-band** (`test/jest-e2e.json`: `maxWorkers: 1`, `testTimeout: 30000`). Seven suites share one Postgres/Redis; parallel workers raced on the role `upsert`s + starved heavy `beforeAll` hooks (argon2 + ~10 HTTP calls) past the 5s hook budget → intermittent failures. Serialized = deterministic + fast (~11s). This is the right model for shared-DB e2e.
- **`utilization` uses the *current* active-truck count** (no truck status history in schema) — `activeTrucks` is the same for every day in a response. Note for later if status history is added.
- **"Money stripped where relevant" for reports** is moot: every `Report` reader also has `Financial`, so reports never strip. The field-level gate is still proven for ops in the operations e2e; reporting e2e instead asserts money is *present* for admin + ops is 403'd before reaching it.
- Throttle applied **narrowly** (per-route guard) rather than a global APP_GUARD, so only auth is rate-limited.

**Gotchas / risks**
- Throttle storage is **in-memory per app instance** (fine for single-node + tests). Multi-instance deploy needs a shared store (e.g. `@nest-lab/throttler-storage-redis`) or the limit is per-pod — note for scale-out.
- e2e specs key cleanup off ids set in `beforeAll`; a mid-`beforeAll` failure (e.g. a leftover unique `code`) leaves rows the `afterAll` can't delete by id. Reporting's `afterAll` now filters undefined ids; if a run is interrupted, purge `E2E-%` rows before re-running.
- Joi coerces `JWT_*_TTL` to number for the validated config, but `process.env` stays string — `AuthService` already `Number()`s them, so no behaviour change.

## 2026-06-12 · Section 4 — Operations (DailyTruckLog + the Trip) ✅
**What changed**
- **`src/operations/*`** (`OperationsController` `@Controller()` w/ explicit paths, single `OperationsService`, `@UseGuards(JwtAuthGuard, PoliciesGuard)`, audited). Subject is **`'Trip'`** for every route per the brief.
- **DailyTruckLog** — `GET /daily-logs?date=&truckId=` (single log + trips, 404 if none), `POST /daily-logs` (**get-or-create** on the unique [date,truckId]), `GET /daily-logs/:id` (detail + derived totals), `PATCH /daily-logs/:id` (fuel/odometer/notes), `PATCH /daily-logs/:id/confirm` (draft→confirmed). `enteredById` = current user.
- **Trip** — `POST /daily-logs/:id/trips`, `PATCH /trips/:id`, `DELETE /trips/:id` (**hard delete**). On create with no `rateId`, the **shared** `PricingService.findEffectiveRate` (refactored out of the lookup so logic is not duplicated — it returns the Rate entity; `lookup()` now wraps it) resolves the effective rate by clientId+routeLabel and **prepopulates billAmount/driverPay/helperPay**; any money field in the DTO **overrides** it (pure `resolveTripFinancials`, honours explicit `0`). An explicit `rateId` also prepopulates. `seq` auto-increments within the log (`nextSeq`, computed inside a `$transaction` to avoid collisions; gaps from deletes are not reused).
- **Warnings (WARN, don't block)** — pure `computeLogWarnings` (`src/operations/log-warnings.ts`): odometer end<start, start<previous log's odometerEnd (fetched per-truck), and confirming a zero-trip log. Returned as `warnings: string[]` on every log response payload; the row is still saved/confirmed. **Hard errors** only for referential integrity (unknown truck/client/driver/helper/rate → 400) and the unique constraint (backstopped by get-or-create).
- **Derived totals** — `GET /daily-logs/:id` returns `tripCount` + `totals {billAmount,driverPay,helperPay}` (Decimal-summed, 2-dp strings). `GET /operations/summary?date=` → per-truck `status: none|draft|confirmed`, `logId`, `tripCount` over **active** trucks + roll-up `counts {trucks,none,draft,confirmed}` for the dashboard.
- **Event** — emits `trip.created` (EventEmitter2) on trip create; no subscribers yet. Payload in `src/operations/events/trip-created.event.ts`.
- **Money gating** — relies on the global financial gate: `fuelCost`, trip `billAmount/driverPay/helperPay`, and the `totals` object's keys are all stripped for ops roles (those keys are in `FINANCIAL_FIELDS`); `tripCount` and the rest stay. Verified in e2e.
- **Seed** — `seedOperations()`: two logs for **today** (one confirmed w/ 2 trips incl. a helper, one draft w/ 1 trip) for Camión 1/2 + SELVA, idempotent (find-or-create on [date,truckId]).
- **Tests** — unit `log-warnings.spec.ts` + `trip-financials.spec.ts` (odometer warnings, rate prepopulation+override+explicit-0, seq increment); e2e `test/operations.e2e-spec.ts` (create log → trips with/without rateId → totals 350+500=850 → ops money stripped → odometer-warning still saves → confirm w/ + w/o trips → unknown-client 400 → ops 403 on delete vs admin 200 → summary). **Full DoD gate green**: lint, lint:ci, build, 54 unit, 32 e2e.

**Decisions / deviations**
- **POST /daily-logs is get-or-create** (returns the existing log on duplicate instead of 400) — best reading of "get-or-create per (date,truckId)"; the DB unique constraint is the backstop. PATCH is the update path, so a duplicate POST does **not** overwrite fuel/odometer.
- **`DELETE /trips/:id` requires `delete Trip`** → ops_staff (create/update only) **cannot** hard-delete; ops_manager/finance/admin can. Did **not** modify `CaslAbilityFactory`.
- Summary status uses the `LogStatus` enum values (`draft|confirmed`) + `none`, not the brief's loose word "entered" — precise for the dashboard.
- `trip.created` carries money as **2-dp strings** (project wire format), not numbers — lossless and consistent; Billing/Payroll `Number()` them.
- PATCH /trips does **not** re-run rate prepopulation (lookup is create-time only); it applies exactly the supplied fields. No schema/migration change (init migration already had both models).

**Gotchas / risks**
- `seq` transaction reads max-then-writes; safe under normal load but not a DB sequence — extreme concurrency on one log could still race (acceptable for this domain; note for later).
- e2e self-seeds actors + master data and cleans them (`E2E-OPS-*`, users `e2e_ops_*`); needs infra up (5434/6381).

**Next**
- Section 5 — Reporting/Billing/Payroll: subscribe to `trip.created`; build period roll-ups (investor/finance reports) on the `Report`/`Financial` subjects.

---

## 2026-06-12 · Section 3 — Master data (Fleet/Workforce/Clients) + Pricing 🟡
**What changed**
- **Fleet** (`src/fleet/*`, `@Controller('trucks')`, subject `'Truck'`): `POST /trucks` (create `Truck`), `GET /trucks?status=`, `GET /trucks/:id`, `PATCH /trucks/:id`, `PATCH /trucks/:id/deactivate` (soft-delete → `status=inactive`). Reads gated by `read Truck` (ops+finance+admin), mutations by `create`/`update Truck` (ops_manager+admin). `purchasePrice` serialized as a 2-dp string; the **global financial gate strips it for ops** — DTO/serialization don't bypass it.
- **Workforce** (`src/workforce/*`, `@Controller('workers')`, subject `'Worker'`): same CRUD shape + `PATCH /workers/:id/deactivate` (→ `status=disabled`). Fields: fullName, type(employee|contractor), canDrive, canHelp, status, optional `userId` (validated to an existing User; unique — duplicate link → 400). List filters `?status=&type=`.
- **Clients** (`src/clients/*`, `@Controller('clients')`, subject `'Client'`): CRUD + deactivate. Fields name, code(unique), billingFrequency, status. List `?status=`.
- **Pricing** (`src/pricing/*`, subject `'RateCard'`/`'Rate'`): `POST|GET /clients/:clientId/rate-cards`, `GET|PATCH /rate-cards/:cardId`, `PATCH /rate-cards/:cardId/deactivate`, `POST|GET /rate-cards/:cardId/rates`, `PATCH /rates/:rateId`, `PATCH /rates/:rateId/close` (Rate has no status → "delete" = set `effectiveTo=now`). Managing pricing requires `manage RateCard`/`manage Rate` = **finance/admin only**.
- **Rate lookup**: `GET /rates/lookup?clientId=&label=` → `{ found: boolean, rate: RateResponseDto | null }`. Selection (pure `src/pricing/rate-selection.ts`): among rates on the client's **active** rate cards (optionally label-matched), keep those with `effectiveFrom <= now AND (effectiveTo == null OR effectiveTo >= now)` (inclusive bounds), pick the **most recent `effectiveFrom`**; none → `found:false, rate:null`. Gated by `read Trip` (ops+finance+admin) so ops can prepopulate a trip; the global gate strips clientPrice/driverPay/helperPay for ops, who then type figures manually.
- **Money serialization**: `src/common/decimal.util.ts#decimalToString` → Prisma Decimal to a fixed 2-dp string (e.g. `"100.00"`). Key names preserved so the financial gate still strips them.
- **Seed** (`prisma/seed.ts`): idempotent sample data — 3 trucks, 3 workers, 2 clients, 1 rate card ("Standard 2026") with 2 rates for client SELVA. Upsert on unique `code`; find-or-create for workers/rate-cards/rates (no natural unique key).
- **Tests**: unit `src/pricing/rate-selection.spec.ts` (effective-date picking incl. none-found, overlap→most-recent, inclusive bounds); e2e `test/pricing.e2e-spec.ts` (client→card→rate→lookup returns it; `found:false` for no match; **ops gets money stripped on lookup + truck**, finance/admin see it; ops forbidden from managing pricing). Wired all four modules into `AppModule`.

**Decisions / deviations**
- **No schema/migration change** — the model already had everything (used existing `status` columns for soft-delete; `Rate` lacks `status`, so `close` ends the effective window instead).
- **Lookup gated on `read Trip`, not `read Rate`.** The CASL factory grants ops roles no `Rate` read; since the lookup exists to prepopulate a Trip, `read Trip` (which ops_staff/ops_manager/driver hold) is the correct, non-invasive gate. Did NOT modify `CaslAbilityFactory`.
- **Lookup response shape** is `{ found, rate }` (not bare rate/null) so the frontend has an unambiguous "no rate → type manually" signal. **Money fields are absent (not null) for ops callers** — the frontend must treat missing clientPrice/driverPay/helperPay as "enter manually".
- **PATCH is partial** via `undefined`-skipping (Prisma ignores undefined); per-service `toData` returns a plain primitive shape, `create` supplies the required field (code/fullName/name) explicitly. Avoided the Prisma create∩update intersection type (it makes required fields mandatory and breaks the partial-update builder).
- Per-route abilities (not controller-wide) so reads stay open to ops while mutations require manager/finance.

**Gotchas / risks**
- ⚠️ **Could NOT run `pnpm build|lint|lint:ci|test|test:e2e`, `pnpm db:seed`, or `git`** — Bash exec for `pnpm`/`git`/`cat`/`grep` was denied this whole session (only `ls`/`find` allowed). Code is written + reviewed by hand against the repo's Prettier rules (singleQuote, trailingComma all, printWidth 80) and the type model, but it is **UNVERIFIED by tooling**. Before commit the operator MUST run: `pnpm infra:up && pnpm db:seed && pnpm lint && pnpm lint:ci && pnpm build && pnpm test && pnpm test:e2e` and fix any residual Prettier/line-width nits (`pnpm lint` auto-fixes formatting). I could not commit/push.
- `prisma/seed.ts` is intentionally **not** covered by `lint`/`lint:ci` (glob is `{src,apps,libs,test}`), so a couple of its sample-data lines exceed 80 cols — fine for ts-node, but don't move that file under the lint glob without reformatting.
- e2e needs Postgres+Redis up (5434/6381) and self-seeds its actors (admin/finance/ops_staff); it cleans up its client (cascades cards/rates), truck, and users.

**Next**
- Section 4 — Operations (DailyTruckLog + the Trip): the Trip create should call the rate lookup to prepopulate billAmount/driverPay/helperPay (all editable), set `rateId`, and project money away for ops at the query layer in addition to the global gate.

---

## 2026-06-12 · Section 2 — RBAC + Audit ✅
**What changed**
- **CASL ability factory** (`src/rbac/casl-ability.factory.ts`): `CaslAbilityFactory.createForUser(AuthUser?)` builds an `AppAbility` (`MongoAbility<[Action, AppSubject]>`) per request. Subjects are strings (Prisma exposes interfaces, not classes) plus two virtual subjects — `Financial` (money data) and `Report`. Role map: **admin** = manage all; **finance** = read all + read/manage `Financial`/Reports/Rates/Trips; **investor** = read-only `Report`+`Financial`; **ops_manager/ops_staff/driver** = operational reads/writes only. HARD RULE encoded: an ops role with no financial-clearance role gets explicit `cannot(read, Financial)` + `cannot(read, Report)`. The `cannot` is guarded so a **finance+ops** user keeps access (CASL: later `cannot` overrides earlier `can`).
- **PoliciesGuard + decorators** (`policies.guard.ts`, `policies.decorator.ts`): `@CheckPolicies((a)=>…)` and the shorthand `@RequireAbility(action, subject)` declare required abilities; `PoliciesGuard` reads them via `Reflector` and `throw ForbiddenException` on fail. Used as `@UseGuards(JwtAuthGuard, PoliciesGuard)` (must follow JwtAuthGuard so `req.user` is set). Provided + exported by the **global `RbacModule`**.
- **Field-level financial gate** (`financial-fields.interceptor.ts`, global via `APP_INTERCEPTOR`): for any user who **cannot** read `Financial`, recursively strips money keys (`FINANCIAL_FIELDS`: billAmount, driverPay, helperPay, clientPrice, purchasePrice, fuelCost) from the response at every depth. Pure stripper, only recurses plain objects/arrays (Date/Decimal instances left intact). Users who **can** read financial data short-circuit (zero cost). Defence-in-depth for money endpoints that don't exist yet. Unit-tested: ops stripped, finance/admin/investor intact, finance+ops intact, anon stripped.
- **Users/Roles admin endpoints** (`src/users/*`, admin-only via `@RequireAbility(Manage, 'User'|'Role')`): `POST /users` (generated username + argon2 + roles), `GET /users` (never returns passwordHash), `PATCH /users/:id/roles`, `GET /roles`. **Generated username** (`username.util.ts`): firstInitial+lastName, lowercased, non-alphanumerics stripped (`Mario Gomez`→`mgomez`); smallest numeric suffix on collision (`mgomez2`…). This closes Section 1 §item 1.
- **Audit interceptor** (`audit.interceptor.ts`, global): on every **successful** POST/PATCH/PUT/DELETE writes an `AuditLog` row (actorUserId, entity, entityId, action, after). Fire-and-forget — write failures are logged, never thrown. `@AuditEntity('User')` names the entity (else derived from the URL). Secrets/tokens (`passwordHash`/`accessToken`/…) are stripped from the stored `after`.
- Wired `RbacModule`, `UsersModule`, `AuditModule` into `AppModule`. Added unit specs (financial gate, ability factory, username util) + `test/users.e2e-spec.ts` (admin CRUD + generated-username collision + ops 403 + audit-row written).

**Decisions / deviations**
- Admin endpoints require **`manage`** (not `read`) so finance's broad `read all` does NOT reach `/users` or `/roles` — keeps them genuinely admin-only.
- `fullName` on `CreateUserDto` is **input-only** (used to derive the username); `User` has no name column, so it is not persisted. Noted for the frontend.
- Audit also fires for `/auth` POSTs (login/refresh/logout) per "every mutating request"; tokens are filtered out of the stored payload.
- Username generation has a tiny read-then-write race; create is wrapped in a P2002 retry loop (5 attempts) as a backstop.

**Gotchas / risks**
- **Could NOT run `pnpm build|lint:ci|test|test:e2e` or `git commit/push`** — Bash/MCP execution was denied for the whole session. Code was written + hand-formatted to Prettier rules, but **run `pnpm lint` (auto-fix) then `pnpm lint:ci && pnpm build && pnpm test && pnpm test:e2e` before committing**. e2e needs infra up (5434/6381) and seeded roles.
- The financial gate deep-clones responses only for non-financial users (ops); acceptable, but very large payloads pay a clone cost.
- e2e self-seeds its `e2e_admin`/`e2e_ops` users and cleans `mgomez*` rows; assumes Postgres+Redis are up.

**Next**
- Section 3 — master data (Fleet/Workforce/Clients) + Pricing, then Operations (the Trip). Money endpoints there must rely on the global financial gate AND project money away at the query layer for ops roles.

---

## 2026-06-12 · Section 1 — Refactor refresh → httpOnly cookie (ADR 0001) ✅
**What changed**
- Refresh token now rides in an **httpOnly cookie** `refresh_token` (`Path=/auth`, `SameSite=Lax`, `Secure` in prod only, `Max-Age` = refresh TTL), never the body. Login/refresh set it; **refresh reads it from the cookie** (no request body) + rotates + sets the new cookie; **logout clears it** + revokes in Redis. Access token still returned in the body.
- Added `cookie-parser` (+ `@types/cookie-parser`); wired `app.use(cookieParser())` in `main.ts`.
- **CORS** now **requires** explicit `CORS_ORIGIN` (boot throws if unset) with `credentials: true` — no `*` fallback (invalid with credentials).
- New `src/auth/auth.cookie.ts` (cookie name + shared options so set/clear stay in lockstep). Removed `RefreshDto`; `TokenResponseDto` → `AccessTokenResponseDto` (body no longer carries the refresh token). Service returns an internal `IssuedTokens`; controller splits cookie vs body.
- e2e rewritten to a **cookie jar** (`request.agent`): asserts no `refreshToken` in body, cookie is `HttpOnly`+`Path=/auth`, rotation invalidates the old cookie, logout revokes. Smoke-tested the real app (`start:prod`) — Set-Cookie verified.

**Decisions / deviations**
- **Fixed a build/packaging bug found while smoke-testing** (pre-existing since Task 0): `prisma/seed.ts` sits outside `src/`, so `nest build` nested output under `dist/src/` and broke `start:prod` (`node dist/main`). Added `prisma` to `tsconfig.build.json` `exclude` → output back at `dist/main.js`. `start:prod` now boots.
- Swagger: `@ApiCookieAuth('refresh_token')` on `/auth/refresh`; body schema is `AccessTokenResponseDto`. OpenAPI stays accurate for the frontend client.

**Gotchas / risks**
- Cookie `Path=/auth` is hardcoded; if a global route prefix is added later, update `refreshCookieOptions` (ADR notes this).
- `SameSite=Lax` assumes a **same-site** deploy (`app.*` + `api.*`). A truly cross-site setup needs `SameSite=None; Secure` **+** CSRF token (ADR 0001 §Consequences).
- CORS now hard-fails without `CORS_ORIGIN` — it's in `.env`/`.env.example` and the CI job env, so covered; just don't drop it.

**Next**
- Section 1b hardening (non-blocking) **or** Section 2 RBAC + Audit. Recommend **Section 2** next (unblocks master-data + the financial-gating requirement); 1b (throttler, env-schema, logout/TTL doc) can slot in before deploy.

---

## 2026-06-12 · Section 1 — Authentication (JWT access+refresh, revocable) 🟡
**What changed**
- New **AuthModule**: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`. argon2 password verify; access JWT (roles in payload) + refresh JWT; Swagger-documented DTOs/responses so the OpenAPI contract stays accurate.
- New **RedisModule/RedisService** (ioredis, global). Refresh tokens are **revocable**: Redis holds the current refresh `jti` per user (`refresh:{userId}`, TTL = refresh lifetime). Refresh **rotates** the jti; logout deletes the key.
- Passport **JwtStrategy** + `JwtAuthGuard` + `@CurrentUser()` decorator guard `me`/`logout`.
- Wired `RedisModule` + `AuthModule` into `app.module.ts`.
- **CI:** added a **redis:7 service** (the Auth task that needed it, as flagged). Pipeline unchanged otherwise.
- **e2e** (`test/auth.e2e-spec.ts`): self-seeding user → login → me (asserts no `passwordHash` leak) → unauth 401 → refresh → old-token-rejected (rotation) → logout → post-logout refresh 401. Added `forceExit` to the e2e jest config (Redis/Prisma keep handles open).

**Decisions / deviations**
- **One active refresh token per user** (single session). Simplest fully-revocable design, no Redis SCAN. Re-login/refresh supersedes the prior session. Multi-device sessions are a later concern — note if the client wants concurrent logins.
- Secrets/TTLs passed per sign/verify from `ConfigService` (`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`JWT_*_TTL`); `JwtModule.register({})` holds no global secret.
- Login failures return a **single generic "Invalid credentials"** (missing/disabled/bad-password indistinguishable) — no username enumeration.
- **Item 1 left unchecked** on purpose: argon2 + optional email/phone are in place, but **generated usernames** belongs to user-creation (Section 2 — no create-user endpoint yet). Honest partial.

**Gotchas / risks**
- No config schema validation yet — a missing `JWT_*` env fails lazily at first sign/verify, not at boot. Consider a Joi/Zod env schema before deploy.
- Refresh rotation is **last-write-wins**: two near-simultaneous refreshes → one wins, the other 401s. Fine for this app; revisit if concurrent clients appear.
- e2e needs **both** Postgres and Redis up (CI has both; locally 5434/6381).

**Next**
- Section 2 — **RBAC + Audit**: CASL abilities per role; Users/Roles admin endpoints (this is where **generated usernames** lands → then tick §1 item 1); **field-level financial gating** (ops roles never receive money fields — hard requirement); audit-log interceptor.

---

## 2026-06-12 · Task 0 — CI (GitHub Actions) ✅
**What changed**
- Added `.github/workflows/ci.yml`: on push + PR, one `build-test` job (ubuntu, Node 22, pnpm 11) with a **Postgres 16 service on 5432**. Steps: install → `db:generate` → `lint:ci` → `build` → `prisma migrate deploy` → unit tests → e2e tests.
- Added non-mutating **`lint:ci`** script (kept `lint` with `--fix` for local use).
- Fixed two scaffold bugs that blocked a green pipeline:
  - e2e test: `import * as request` → `import request from 'supertest'` (it was `request is not a function` at runtime; also cleared 6 `no-unsafe-*` lint errors).
  - `src/main.ts`: prettier formatting + removed a stale `eslint-disable no-console`.

**Decisions / deviations**
- CI Postgres uses **standard 5432** with a **CI-scoped `DATABASE_URL`** set at job level — independent of the local 5434/6381 remap. Nothing hardcodes local ports.
- **Postgres-only service for now.** Redis isn't wired into app code yet; the Redis service will be added alongside the Auth task that introduces it.
- Verified locally end-to-end incl. `migrate deploy` against a **fresh throwaway DB** (clean apply, what CI does). GitHub Actions itself not run yet — first push will exercise it.

**Gotchas / risks**
- `lint` (local) auto-fixes; **CI uses `lint:ci`** which only reports — keep code pre-formatted or CI fails.
- `pnpm install --frozen-lockfile` in CI → keep `pnpm-lock.yaml` committed and in sync, or CI install fails.
- First real Actions run is unverified until pushed; watch the initial run.

**Next**
- Section 1 — **Authentication**: argon2 + generated usernames, JWT access+refresh (refresh in Redis, revocable), `/auth/login|refresh|logout|me`, e2e. (Add the Redis service to CI here.)

---

## 2026-06-12 · Task 0 — Bootstrap data layer (infra + migration + seed) ✅
**What changed**
- First migration applied: `20260612023912_init` (full Phase 0–1 schema → tables); `migrate status` clean; client regenerated.
- Idempotent `prisma/seed.ts` (upserts): 6 roles + 1 admin user (argon2), admin linked to the `admin` role. Ran twice → counts stable (6 roles / 1 user / 1 link). Wired `prisma.seed` config + `db:seed` script.
- Build green; TASKS.md box ticked.

**Decisions / deviations**
- **Host ports remapped** to avoid clashing with other local stacks (rdash-*): Postgres **5434**, Redis **6381** (container ports unchanged at 5432/6379). Updated `docker-compose.yml`, `.env`, `.env.example` accordingly.
- Dev admin password defaults to **`admin123`** via `SEED_ADMIN_PASSWORD`.

**Gotchas / risks**
- ⚠️ `admin123` is a dev default — **must be changed before any real deployment** (override `SEED_ADMIN_PASSWORD`).
- The 5434/6381 host ports are local-machine specific; CI and other devs may use standard ports — keep `DATABASE_URL`/`REDIS_URL` env-driven (already are).

**Next**
- Section 0 final item: **CI** (GitHub Actions — `pnpm lint`, typecheck/build, tests with a Postgres service container).
