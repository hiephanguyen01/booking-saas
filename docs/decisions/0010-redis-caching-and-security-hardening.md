# ADR 0010 — L1 Redis caching, Index-Set invalidation, and production hardening

**Status:** Accepted (describes the shipped implementation, documented 2026-09-09).

## Context

Following a comprehensive production-grade architecture audit, several operational and performance bottlenecks were addressed:

1. **Session Lookup Overhead:** Every authenticated API request invoked `PrismaSessionStore.findByAccessToken`, issuing a PostgreSQL `SELECT` query even though sessions are valid for hours. Under high concurrent load, this saturated the database connection pool with read traffic.
2. **Redis Event Loop Blocking:** Permission cache invalidation in `PermissionResolverService.invalidate()` called `redis.keys('perms:*')`, an $O(N)$ command that blocks the single-threaded Redis event loop when the keyspace grows.
3. **Public Listing Aggregation Overhead:** `PrismaListingRepository.findPublicBySlug` executed an uncached raw SQL `JOIN` with `AVG(EXTRACT(EPOCH FROM ...))` and `booking.count` on every public listing page visit, quote request, and availability check.
4. **Gateway Security & Timing Attacks:** `AesGcmCryptoService` fell back to a shared dev encryption key if `PAYMENTS_ENC_KEY` was missing, and `ZalopayGatewayAdapter` verified webhook signatures using JavaScript string equality (`===`), vulnerable to timing attacks.
5. **Observability & Request Tracing:** Error responses and logs lacked an end-to-end correlation ID (`x-request-id`), making distributed troubleshooting between SSR frontends and the API difficult.

## Decision

### 1. L1 Redis Session Cache with Invalidation Strategy
`PrismaSessionStore` implements a resilient read-through Redis cache:
- Key format: `sess:${sha256(accessToken)}` with TTL equal to the session's remaining lifetime.
- Cache degradation: all Redis operations are wrapped in `try...catch`; errors gracefully fall back to PostgreSQL without interrupting user traffic.
- Immediate eviction:
  - `rotate(refreshToken)`: deletes old access token hash from Redis.
  - `revoke(sessionId)`: looks up session hash and purges it.
  - `revokeAllForUser(userId)` / `revokeOtherSessionsForUser(...)`: queries active sessions and removes all corresponding hashes.

### 2. User Index Set Pattern for $O(1)$ Permission Invalidation
`PermissionResolverService` replaces `redis.keys()` with an atomic index set pattern:
- Cache key: `perms:${tenantId ?? '_'}:${partnerId ?? '_'}:${userId}`.
- When caching a permission set, the key is added to a user-scoped index set: `perms-index:${userId}` with a TTL of `entryTTL + 30s`.
- When invalidating: reads `smembers(perms-index:${userId})` and deletes the index plus all indexed keys in a single atomic pipeline.

### 3. Public Trust Signals Read-Through Cache
`PrismaListingRepository.findPublicBySlug` caches the listing trust metrics (completed booking count and average partner response time) in Redis for 5 minutes (`listing-trust:${listingId}`).

### 4. Strict Production Key Validation & Constant-Time Verification
- `AesGcmCryptoService` validates at application boot that `PAYMENTS_ENC_KEY` is present, at least 32 characters, and not set to dev defaults when `NODE_ENV === 'production'`. The derived 256-bit key buffer is cached in the instance constructor.
- All four payment gateway adapters (`sepay`, `momo`, `payos`, `zalopay`) strictly enforce constant-time signature verification using `crypto.timingSafeEqual` over UTF-8 byte buffers.

### 5. Distributed Request Tracing & Latency Observability
- `LoggerModule` (`pinoHttp`) in `apps/api` parses incoming `x-request-id` headers or generates a UUID, exposing `res.setHeader('x-request-id', id)`.
- `DomainExceptionFilter` extracts the correlation ID, prefixing 5xx error logs and including `requestId` in the returned JSON envelope (`apiErrorSchema` in `@booking/contracts`).
- Public booking OTP endpoints (`request-otp`, `verify-access`) and customer review endpoints enforce granular `@Throttle` rate limits.
- The `/health/ready` probe measures and returns real-time `dbLatencyMs` and `redisLatencyMs`.

## Consequences

- **Database Load:** Authenticated requests achieve near-zero PostgreSQL session read queries on cache hits.
- **Redis Reliability:** Zero risk of Redis event loop freeze from scanning keys; permission invalidation is strictly scoped per user.
- **Security Posture:** Insecure production starts are prevented at boot; webhook tampering via timing attacks is eliminated across all payment channels.
- **Static CI Enforcement:** All invariants are statically asserted by `tests/architecture/payments-encryption-guard.test.ts` (83 tests passing in CI).
