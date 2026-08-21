# AUTH-001 Login Abuse Protection Design

Date: 2026-08-21
Status: Approved design, pending implementation plan
Base: `main` at `1c02941283a586a5df0724c14930010ca4f2f04f`

## Problem

BookingOS currently persists account-wide password lockout state in `users.failed_login_count` and `users.locked_until`. Five failed password attempts cause the account to reject every subsequent password login for fifteen minutes, regardless of where the failures originated.

That behavior prevents simple online guessing, but it also creates a targeted denial-of-service primitive: anyone who knows a victim's email address can deliberately submit five wrong passwords and make the victim unable to sign in from another device or network.

The existing Nest throttler does not solve this. Browser traffic reaches the API through the storefront or dashboard SSR/BFF process, so the API normally sees the frontend container as the socket peer. The repository explicitly documents these throttle limits as site-wide capacity ceilings rather than per-user abuse controls.

## Security invariant

An unauthenticated source must not be able to create persistent account state that prevents a victim with the correct password from logging in from an unrelated trusted client IP.

## Goals

1. Remove account-wide password lockout from the login decision.
2. Preserve meaningful online credential-guessing protection.
3. Rate-limit abuse by trusted client source rather than by a victim-controlled account identifier alone.
4. Prevent browser-supplied spoofing of the client-IP signal used by the limiter.
5. Preserve public error non-enumeration between unknown-email and wrong-password failures.
6. Keep the change fail-safe for availability: a limiter outage must not become a global login outage.
7. Avoid exposing plaintext email addresses, IP addresses, passwords, or raw Redis keys in logs/telemetry.
8. Keep database schema cleanup out of this change unless needed for correctness.

## Non-goals

- Removing `failed_login_count` / `locked_until` columns in this change.
- Replacing all API throttling with client-aware throttling.
- Building CAPTCHA, device fingerprinting, WebAuthn, or adaptive MFA.
- Solving distributed credential stuffing perfectly at the account level by blocking the account.
- Changing registration/password-reset OTP protections except where shared client-IP plumbing is reused safely.

## Current state

### Login domain flow

`LoginUseCase` loads a user by email, calls `UserAccount.assertCanPasswordLogin(now)`, verifies Argon2, calls `recordLoginFailure()` on a bad password, persists the resulting lockout intent, and clears lockout state on success.

`UserAccount` defines:

- `MAX_FAILED_LOGIN_ATTEMPTS = 5`
- `LOGIN_LOCKOUT_MINUTES = 15`
- account-wide `lockedUntil` gating before password verification
- reset-to-zero behavior after the fifth failure

### Existing throttling

`POST /auth/login` uses `THROTTLE_AUTH_ATTEMPT`, but `apps/api/src/shared/http/throttle-limits.ts` documents that these limits are shared site-wide because backend calls originate from SSR/BFF containers. They are capacity ceilings, not client abuse controls.

### Production ingress

Production exposes only Caddy on ports 80/443. API, storefront, and dashboard are internal compose services. Caddy is therefore the public trust boundary today.

## Chosen architecture

Use an explicit trusted client-IP header injected by Caddy, forward it through BFF auth calls, and enforce login-specific Redis abuse limits in the API.

```text
Internet
   |
   v
Caddy
   | overwrite X-BookingOS-Client-IP with remote peer IP
   v
Storefront / Dashboard BFF
   | forward the trusted header only on server-to-server auth calls
   v
API /auth/login
   | validate trusted client IP
   | pre-check Redis source-scoped buckets
   | verify credentials
   | record source-scoped failure or clear pair bucket on success
   v
Session creation
```

Direct requests to the public `api.*` hostname also traverse Caddy and receive the same trusted header before reaching the API.

## Trust boundary and client IP propagation

### Header

Canonical internal header:

`X-BookingOS-Client-IP`

The header name is intentionally application-specific rather than reusing `X-Forwarded-For`, so its trust semantics are explicit and do not silently change if the deployment later adds another proxy layer.

### Caddy behavior

Every public reverse-proxy path MUST overwrite `X-BookingOS-Client-IP` with Caddy's direct remote peer IP. Incoming browser values are never preserved.

Current production topology makes the direct remote peer the end user because no CDN/load balancer is in front of Caddy.

If a CDN, ALB, or another proxy is introduced later, this design MUST be revisited before production rollout. Caddy must first establish a trusted-proxy policy and derive the true client IP from that policy; simply forwarding the immediate proxy peer would group all users behind the upstream proxy.

### BFF behavior

Storefront and dashboard receive the Caddy-injected header on the original HTTP request. Server-side login calls forward that exact value to the API.

BFF code MUST:

- accept only a single IPv4 or IPv6 literal;
- trim surrounding whitespace before validation;
- if the header is missing, comma-separated, or malformed, omit `X-BookingOS-Client-IP` from the backend login call and let the API treat the signal as unavailable;
- never derive this value from browser form fields or client JavaScript;
- never forward an arbitrary browser-provided fallback header.

Storefront already has request-aware auth request options, so login can reuse that path. Dashboard `backendLogin()` currently does not receive the `Request`; it will be changed so its login action passes the current request to the server-only API wrapper.

### API behavior when trusted IP is absent

The login limiter treats a missing or malformed trusted IP as a limiter-signal failure, not as an authentication failure.

In production:

- do not silently substitute the BFF/container socket peer into the source limiter, because that recreates a shared site-wide bucket;
- emit `auth.login.client_ip_unavailable` telemetry;
- skip source-scoped limiter enforcement for that request;
- continue normal credential verification.

This is deliberately availability-preserving. Caddy/BFF configuration drift should be visible operationally but must not become a global login outage.

For local development and disposable runtime smoke, direct API callers may supply the canonical header explicitly.

## Redis limiter semantics

Use Redis because it is already a required shared infrastructure dependency and is available to every API instance.

All windows are sliding windows, not fixed minute buckets.

### Bucket A: client IP + normalized email

Purpose: stop repeated guessing of one account from one source without affecting other sources.

- threshold: 5 failed attempts
- window: 10 minutes
- key scope: trusted client IP + normalized email
- effect: only that IP/email pair is rate-limited

The fifth bad attempt is recorded and returns the normal invalid-credentials response. The next attempt within the active window is rejected before Argon2 work.

### Bucket B: client IP

Purpose: stop one source from spraying many accounts.

- threshold: 30 failed attempts
- window: 10 minutes
- key scope: trusted client IP
- effect: that IP cannot attempt additional password logins until enough failures age out of the sliding window

This bucket is not cleared by successful login, because otherwise one known credential could be used to reset a source-wide credential-stuffing budget.

### Bucket C: account observation only

Purpose: detect distributed attacks against one account without reintroducing account-wide denial of service.

- window: 10 minutes
- observation threshold: 20 failed attempts
- distributed suspicion requires failures from at least 3 distinct hashed client IPs in the active window
- effect: telemetry/audit only; NEVER block the account

The observation store may keep recent entries as timestamp + hashed-IP members. When the threshold is reached, the service counts distinct hashed source IDs in the active window and emits a suspicion event if the distinct-source threshold is met.

A successful login does not erase the account observation window. This signal is diagnostic, not an authorization gate.

## Key privacy

Redis keys and members MUST NOT contain raw email addresses or IP addresses.

Use a dedicated HMAC secret to derive deterministic identifiers:

- `auth:login:pair:<hmac>`
- `auth:login:ip:<hmac>`
- `auth:login:account-observe:<hmac>`

Introduce an API configuration secret such as `AUTH_RATE_LIMIT_HMAC_KEY`.

Requirements:

- required in production;
- same value across all API replicas;
- not reused from payment encryption or frontend session secrets;
- development may use an explicit documented non-production fallback;
- no HMAC secret value appears in logs.

HMAC input domains must be separated, e.g. `ip\0<ip>`, `email\0<normalizedEmail>`, and `pair\0<ip>\0<normalizedEmail>` so identifiers from different namespaces cannot collide semantically.

## Atomic Redis operations

Limiter mutation and pre-check operations must be race-safe across concurrent API instances.

Preferred implementation: a small Redis Lua script or equivalent transaction that, for each sliding-window bucket:

1. removes entries older than the window;
2. reads the active count;
3. decides whether the bucket is already limited;
4. records a new failure with a unique member when requested;
5. sets/refreshes a bounded TTL so abandoned keys expire naturally.

Bucket A and Bucket B recording for one bad credential attempt MUST be issued through one atomic Redis operation so a concurrent API process cannot observe only half of the blocking state. Bucket C is observation-only and may be recorded separately; failure to record it must never change login authorization.

Any Redis operation failure is treated as limiter unavailable for that request and logged; authentication behavior remains correct independently.

## Login request flow

### Pre-check

1. Normalize email using the same canonicalization used by the existing login contract/repository path.
2. Extract and validate `X-BookingOS-Client-IP`.
3. If the trusted IP is present, check Bucket A and Bucket B before user lookup / Argon2.
4. If either blocking bucket is already at its threshold, return `429 AUTH_RATE_LIMITED` without password verification.
5. Do not extend or refresh the abuse window merely because a blocked request was attempted.

### Unknown email

If the email does not map to an account:

1. return the same public invalid-credentials response used for wrong passwords;
2. if the trusted IP is present, record a failure in Bucket A and Bucket B;
3. record the account-observation entry against the normalized-email HMAC namespace as well.

This keeps attacker cost and source limiting consistent without revealing whether the account exists.

### Wrong password

If Argon2 verification fails:

1. record Bucket A, Bucket B, and Bucket C observation;
2. return generic invalid credentials;
3. do not write `failedLoginCount` or `lockedUntil` to PostgreSQL.

### Correct password

If password verification succeeds:

1. clear the Bucket A IP/email pair history for that exact source/account pair;
2. leave Bucket B IP-wide failures untouched;
3. leave Bucket C observation history untouched;
4. create the session normally.

A correct password from a different trusted IP must succeed even if another IP has exhausted its pair bucket against the same account.

## Removal of account-wide lockout behavior

The new login flow no longer reads or writes password lockout state.

Implementation consequences:

- `UserAccount.assertCanPasswordLogin()` stops checking `lockedUntil` but continues enforcing suspended-account and passwordless-guest rules;
- `LoginUseCase` stops calling `recordLoginFailure()`, `recordLoginSuccess()`, and `users.updateLockout()`;
- login no longer raises `ACCOUNT_LOCKED`;
- frontend login flows stop displaying account-lockout-specific copy;
- `failedLoginCount` and `lockedUntil` database columns remain for compatibility in this change;
- repository/entity fields may remain temporarily where removing them would create unnecessary migration coupling, but they are dead with respect to password-login decisions.

A user who was locked by the old implementation can log in with the correct password immediately after the new code is deployed. No data migration is required for correctness.

A later cleanup change may remove the unused columns, port methods, domain methods/constants, and obsolete error type after confirming no other flow depends on them.

## HTTP responses

### Invalid credentials

Unknown email and wrong password remain indistinguishable externally.

Expected public result:

- HTTP 401
- code: `INVALID_CREDENTIALS`
- generic message

### Source rate limited

Expected public result:

- HTTP 429
- code: `AUTH_RATE_LIMITED`
- generic message such as `Too many login attempts. Please try again later.`

The response MUST NOT reveal:

- whether Bucket A or Bucket B fired;
- exact failure count;
- whether the email exists;
- raw Redis key / digest;
- exact attack-source cardinality.

A coarse `Retry-After` may be returned if easy to compute from the oldest active failure, but it is not required for the first implementation.

## Redis failure mode

The limiter is fail-open for login authorization, while password authentication remains fail-closed as usual.

If Redis limiter operations fail after successful application boot:

- emit `auth.login.limiter_unavailable`;
- continue user lookup/password verification;
- wrong credentials still fail;
- correct credentials proceed to normal session creation;
- session-store failure still fails login according to existing behavior.

This prevents a Redis limiter issue from becoming an intentional or accidental global login outage.

## Observability

Emit structured events/metrics without raw PII:

- `auth.login.failed`
- `auth.login.rate_limited` with `scope=pair|ip`
- `auth.login.distributed_attack_suspected`
- `auth.login.limiter_unavailable`
- `auth.login.client_ip_unavailable`

Allowed identifiers are HMAC-derived account/IP/source IDs and non-sensitive dimensions. Do not log plaintext email, IP, password, submitted headers, presigned/session tokens, or Redis secret material.

For `distributed_attack_suspected`, include only coarse values such as active failure count and distinct hashed-source count.

## Frontend behavior

Storefront and dashboard login flows must recognize `AUTH_RATE_LIMITED` and show user-friendly copy such as:

`Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.`

They must stop referring to the account itself as locked.

No client-side countdown is required.

## Configuration and deployment

### New configuration

Add `AUTH_RATE_LIMIT_HMAC_KEY` to API deployment configuration and deployment documentation.

Production boot MUST fail fast if this secret is missing or obviously unsafe, matching the repository's existing production-secret posture where practical. This is a configuration-integrity guard and is intentionally distinct from runtime limiter fail-open behavior: once a correctly configured process has booted, Redis limiter operation failures do not block credential verification.

### Caddy

Update all relevant `reverse_proxy` paths to overwrite the canonical client-IP header before forwarding to storefront/dashboard/API.

Validate Caddy syntax using the repository's deployment validation command before merge.

### No database migration

This design intentionally requires no Prisma migration. Existing lockout columns remain inert.

## Verification

ADR 0005 forbids adding automated test files/runners, so verification uses repository static gates plus disposable runtime smoke.

### Static gates

At minimum:

- `pnpm check:no-tests`
- `pnpm check:module-cycles`
- `pnpm --filter=@booking/api lint`
- `pnpm --filter=@booking/api typecheck`
- `pnpm --filter=@booking/api build`
- `pnpm --filter=@booking/api check:rls`
- storefront/dashboard lint + typecheck + production builds
- existing storefront security/structure gates
- Caddy config validation

### Disposable runtime acceptance matrix

1. Same trusted IP + same email: five bad passwords are recorded; the next attempt returns 429 before Argon2.
2. Correct password from a different trusted IP succeeds while the attacker's pair is limited.
3. One trusted IP spraying many accounts reaches 30 failures and is source-limited.
4. Successful login clears only the exact IP/email pair history.
5. Successful login does not clear IP-wide failure history.
6. Unknown email and wrong password return the same external credential error shape.
7. A browser-provided fake `X-BookingOS-Client-IP` is overwritten at Caddy before reaching an application.
8. Storefront forwards the trusted header on login.
9. Dashboard forwards the trusted header on login.
10. Direct public `api.* /auth/login` receives the Caddy-injected trusted header.
11. Missing/malformed trusted IP emits telemetry but does not create a shared BFF-IP limiter bucket.
12. Redis limiter outage still allows a correct password to reach normal session creation while emitting limiter-unavailable telemetry.
13. Distributed failures against one account from at least three distinct source digests emit suspicion telemetry but do not block a correct login from another source.
14. Existing persisted `lockedUntil` in PostgreSQL no longer prevents correct-password login.
15. No failed login mutates `failedLoginCount` or `lockedUntil`.
16. Frontend shows the new rate-limit message and no longer claims the account itself is locked.

## Rollout and rollback

Rollout order is one normal application deployment because Caddy, BFF, and API changes ship from the same repository/deployment stack.

Before declaring AUTH-001 fixed in a deployed environment:

1. confirm Caddy is injecting/overwriting the canonical header;
2. confirm BFF login calls preserve it;
3. confirm rate-limit telemetry shows hashed source dimensions rather than a single shared frontend-container identity;
4. run the disposable acceptance cases in staging or an equivalent production-shaped environment.

Rollback to the prior build restores the old account-wide lockout semantics because the database columns remain intact. No schema rollback is needed.

## Future hardening

Out of scope for this change but compatible with the design:

- adaptive thresholds based on reputation/risk signals;
- CAPTCHA or proof-of-work after repeated failures;
- breached-password checks;
- WebAuthn/passkeys;
- richer distributed-attack alerting;
- cleanup migration removing legacy account-lockout columns after one release cycle;
- trusted-proxy configuration if a CDN/load balancer is added before Caddy.
