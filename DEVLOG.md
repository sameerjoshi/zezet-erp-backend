# DEVLOG — Zezet ERP Backend

Dev log. Newest entry on top. One entry per task / notable change.
Format per entry: **What changed · Decisions/deviations · Gotchas/risks · Next.**

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
