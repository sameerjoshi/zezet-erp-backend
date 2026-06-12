# DEVLOG — Zezet ERP Backend

Handoff log. Newest entry on top. One entry per task / notable change.
This is what the planning/review session reads to see where the backend is and what's next.
See `CLAUDE.md` → "Working rhythm & handoff" for the format. Status of items lives in `TASKS.md`.

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
