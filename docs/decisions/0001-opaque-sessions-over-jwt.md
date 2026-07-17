# ADR 0001 — Opaque session cookies over JWT

**Status:** Accepted (describes the shipped implementation, documented 2026-07-17).

## Context

Every actor authenticates against the API, and two SSR frontends (BFF) act on the user's behalf. An
earlier draft of the docs described stateless **JWT** access tokens + refresh tokens. **The code does
not do this** — there is zero JWT code in `apps/api/src` (no `JWT_SECRET`, no `JwtAuthGuard`, no
`jwt-token.service.ts`).

## Decision

Use **opaque, server-side sessions**:

- The API issues opaque tokens (random, SHA-256-hashed at rest) held in `Session` rows; the guard is
  `SessionAuthGuard` (reads the `sid` cookie). Refresh rotates (`refresh-session.use-case.ts`).
- Registration and password reset use **email OTP** flows; guest checkout authenticates by booking code
  + email OTP. OTPs live in Redis, not the DB.
- The frontends are BFFs: the browser never holds a token. The dashboard stores session state in Redis
  and keeps only a signed id in an `httpOnly` cookie; the storefront resolves per-request auth in
  middleware.

## Consequences

- Sessions are **revocable** immediately (delete the row) — no token-expiry window to wait out.
- Every authenticated request costs a session lookup (cheap; Redis/DB), traded for revocability and no
  token-leak blast radius.
- Swagger's `addBearerAuth` is cosmetic — the guard reads a cookie, not `Authorization: Bearer`.
- Any doc/skill that says "JWT", "access token", or "`JWT_SECRET`" for this repo is stale.
