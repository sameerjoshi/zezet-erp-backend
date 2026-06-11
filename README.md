# Zezet ERP — Backend

API for the Zezet ERP (trucking/logistics, Panama). NestJS · TypeScript · PostgreSQL (Prisma) · Redis.

See `CLAUDE.md` for architecture, conventions, and the modular-monolith / event-bus approach.
Data model, API surface, and trial scope: `SPEC_Trial_Phase0-1.md` in the management hub.

## Stack
- NestJS + TypeScript (strict)
- PostgreSQL via Prisma (migrations only)
- Redis (refresh tokens, cache, queues)
- pnpm
- OpenAPI (`@nestjs/swagger`) — contract for the frontend's generated client

## Getting started
> Scaffolding pending (trial Day 3). Once initialized:
```bash
pnpm install
cp .env.example .env   # set DATABASE_URL, REDIS_URL, JWT secrets
pnpm prisma migrate dev
pnpm start:dev
```
