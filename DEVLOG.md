# DEVLOG — Zezet ERP Backend

Handoff log. Newest entry on top. One entry per task / notable change.
This is what the planning/review session reads to see where the backend is and what's next.
See `CLAUDE.md` → "Working rhythm & handoff" for the format. Status of items lives in `TASKS.md`.

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
