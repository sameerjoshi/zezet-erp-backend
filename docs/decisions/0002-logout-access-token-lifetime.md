# ADR 0002 — Logout revokes the refresh token only; access tokens live out their TTL

**Status:** Accepted · 2026-06-12
**Context for:** both repos (backend behaviour; frontend must account for it)

## Context
`POST /auth/logout` deletes the Redis `refresh:<userId>` key and clears the `refresh_token`
cookie (ADR 0001). Access tokens are **stateless JWTs** verified by signature + `exp` — they are
not checked against Redis on each request, so logout cannot retroactively invalidate one already
issued.

## Decision
- **Logout revokes the refresh token only.** The previously issued **access token stays valid
  until its own `exp`** (`JWT_ACCESS_TTL`, ≤ 15 minutes). After logout the user simply cannot
  obtain a new access token (refresh is dead), so the session dies within one access-TTL window.
- We accept this ≤ 15-minute residual rather than pay the per-request Redis lookup (denylist) that
  stateless JWTs are chosen to avoid. The short TTL is the mitigation.

## Consequences
- ✅ No per-request Redis hit on the hot auth path; refresh remains the single revocation handle.
- ⚠️ A stolen/leaked access token remains usable for up to its TTL even after logout. If a hard
  "kill all sessions now" is ever required (e.g. account compromise), introduce a token denylist or
  a per-user token `version`/epoch checked at verify time — revisit then.
- Frontend: on logout, drop the in-memory access token immediately; do not rely on the server to
  reject it.

## Rollback
Add a denylist (store revoked `jti`/`exp` in Redis, check in the JWT strategy) if the residual
window becomes unacceptable.
