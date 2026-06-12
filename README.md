# Zezet ERP — Backend

API for the Zezet ERP — a custom, single-tenant ERP for a trucking/logistics company in Panama.
**NestJS · TypeScript · PostgreSQL (Prisma 6) · Redis.** Bilingual product (API stays language-neutral); USD.

Modular monolith, loosely coupled: domain modules own their tables and talk via an internal event bus
(`@nestjs/event-emitter`) so later modules subscribe to events like `trip.created` without coupling.
OpenAPI is served at `/docs` — it's the contract the frontend generates its client from.
Architecture decisions are recorded in `docs/decisions/`; progress in `DEVLOG.md`.

## Getting started
```bash
pnpm install
cp .env.example .env          # DATABASE_URL, REDIS_URL, JWT secrets, CORS_ORIGIN
pnpm infra:up                 # docker compose: PostgreSQL + Redis
pnpm db:migrate               # apply migrations
pnpm db:seed                  # roles + dev admin (override SEED_ADMIN_PASSWORD)
pnpm start:dev                # API on :3001, docs at /docs
```

## Conventions (essentials)
- Migrations only (never hand-edit the DB). Validate input with class-validator DTOs at the boundary.
- **CASL** role-based auth with **field-level financial gating** — operations roles never receive money fields.
- Auth: JWT access (memory) + refresh in an **httpOnly cookie**, revocable via Redis (see `docs/decisions/`).
- Audit every create/update/delete. Warn-don't-block on messy data. No AI-assistant signatures in commits/code.
