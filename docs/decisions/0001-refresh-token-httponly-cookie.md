# ADR 0001 — Refresh token in an httpOnly cookie

**Status:** Accepted · 2026-06-12
**Context for:** both repos (backend issues it; frontend consumes it)

## Context
Initial Auth returned the refresh token in the JSON body, leaving the client to store it
(localStorage/JS) — which is XSS-exposed and contradicts the frontend rule "never store secrets in
localStorage." We need one settled contract before the frontend builds its auth flow.

## Decision
- **Refresh token** is delivered and stored as a cookie:
  `refresh_token`, **httpOnly**, **Secure** (production only), **SameSite=Lax**, **Path=/auth**,
  `Max-Age` = refresh TTL. Never in the response body; never readable by JS.
- **Access token** stays short-lived, returned in the response body, held in **frontend memory**, sent as
  `Authorization: Bearer`.
- Redis stays the revocation source of truth (`jti` per user, rotate on refresh, delete on logout) —
  unchanged. The cookie just carries the refresh JWT.

## Endpoint contract (after refactor)
- `POST /auth/login` → sets the `refresh_token` cookie; body returns `{ accessToken, tokenType, expiresIn }`.
- `POST /auth/refresh` → reads the token **from the cookie** (no request body); rotates; sets a new cookie;
  body returns a new `{ accessToken, ... }`. (`RefreshDto`/body param removed.)
- `POST /auth/logout` → deletes the Redis key **and** clears the cookie.

## Implementation notes (backend)
- Add `cookie-parser`; use `@Res({ passthrough: true })` to set/clear the cookie (keep return values typed).
- Cookie options env-aware: `secure: NODE_ENV === 'production'`.
- **CORS with credentials:** `Access-Control-Allow-Origin` must be the **explicit** frontend origin, not `*`
  (a wildcard is invalid when `credentials: true`). Fix `main.ts` to require `CORS_ORIGIN` rather than
  falling back to `*`.
- If a global route prefix is added later, update the cookie `Path` accordingly.

## Implementation notes (frontend)
- All auth requests use credentials (`fetch(..., { credentials: 'include' })` / axios `withCredentials`).
- Keep only the access token in memory. On 401, call `/auth/refresh` (cookie sent automatically), then retry.
- No refresh token ever touches JS storage.

## Consequences
- ✅ Refresh token is not reachable by XSS.
- ⚠️ Cookies introduce CSRF surface; **SameSite=Lax + Path=/auth** mitigates it for the auth endpoints.
  Recommended deployment is **same-site** (e.g. `app.zezet.net` + `api.zezet.net`) so cookies flow with
  `SameSite=Lax`. If a truly cross-site setup is ever needed, revisit with `SameSite=None; Secure` **and** a
  CSRF token.
- Works in dev on `localhost:3000 → localhost:3001` (same-site, Secure off).

## Rollback
Revert to body-based refresh (the prior commit) — but then the frontend must store the refresh token, which
this ADR exists to avoid.
