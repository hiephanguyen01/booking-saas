# PR #7 — Identity-access entity-centric refactor — Implementation Plan

> **Execution rule:** implement task-by-task. After every task: commit → prepare a review package →
> independent spec/quality review → fix every finding (and re-review when needed) before starting the
> next task. After Task 5, run a separate final review over the whole branch. Do not collapse these
> gates.

**Goal:** Refactor the identity-access write-path around three framework-free aggregates —
`UserAccount`, `Session`, and `AuthChallenge` — without changing authentication behavior, public
contracts, global guard behavior, cookie/throttle security, Redis/Prisma persistence shapes, or the
observable races on the hot authentication paths.

**Architecture:** Follow
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3–§4 and the identity-access survey in
[`entity-centric-survey.md`](../../refactor/entity-centric-survey.md). This module is a deliberate
global/admin-pool island: no tenant context, no `forTenant`, no outbox, and no transaction parameter
on its ports. The aggregates own policy while hash generation, timing-safe comparison, Prisma/Redis
atomic operations, and hot read projections remain in adapters.

**Tech stack:** NestJS 11, Prisma + PostgreSQL, Redis/ioredis, opaque SHA-256 token storage, Argon2,
pnpm 10.13.1, Node 22.22.0.

## Global constraints

- **NO tests** (ADR 0005). Verification is typecheck + lint + build + `check:rls` + manual runtime.
- **ADR 0006:** controller → use-case → repository-port → repository; no application service
  classes; one injectable use-case per file with one public `execute()`.
- Schema/migrations, controllers, DTOs/contracts, response shapes, cookies, decorators, route
  permissions, throttles, global guards, and read projections are frozen.
- Domain code is framework-free. Entity methods receive `Date`/epoch milliseconds from the current
  app-clock call site; no entity calls `new Date()` or `Date.now()`.
- This module continues to use `prisma.admin`. Do not add `forTenant`, `PrismaTx`, RLS context,
  nested transactions, or outbox events.
- No plaintext access token, refresh token, OTP, password, or completion token may enter aggregate
  state or a persisted/event DTO. Random generation, SHA-256, Argon2, and `timingSafeEqual` remain
  adapter capabilities.
- Rehydrate is tolerant. Existing user/session rows and unversioned Redis JSON must never fail
  because an aggregate added stricter validation.
- Branch: **`refactor/entity-identity-access`**, created from `refactor/entity-centric` after this
  plan commit; PR base is `refactor/entity-centric`.

### Frozen error table

All status/code/message triples and the existing Nest envelope stay byte-identical:

| Code | Status | Message | Extra top-level field |
|---|---:|---|---|
| `EMAIL_TAKEN` | 409 | `Email is already registered` | — |
| `EMAIL_REGISTERED` | 409 | `This email has an account — please sign in to book` | — |
| `EMAIL_REGISTERED` | 409 | `This email already has an account — please sign in` | — |
| `GUEST_NOT_FOUND` | 404 | `No guest booking found for this email — book first, then upgrade` | — |
| `INVALID_CREDENTIALS` | 401 | `Invalid email or password` | — |
| `ACCOUNT_LOCKED` | 403 | `Account temporarily locked after too many failed attempts` | — |
| `ACCOUNT_SUSPENDED` | 403 | `Account is suspended` | — |
| `NO_REFRESH_TOKEN` | 401 | `Missing refresh token` | — |
| `INVALID_REFRESH_TOKEN` | 401 | `Refresh token is invalid or expired` | — |
| `CHALLENGE_EXPIRED` | 410 | `The verification request has expired` | — |
| `RESEND_COOLDOWN` | 429 | `Please wait before requesting another code` | `retryAfterSec` |
| `OTP_ATTEMPTS_EXCEEDED` | 429 | `Too many invalid attempts` | — |
| `OTP_INVALID` | 400 | `The verification code is invalid` | `attemptsRemaining` |
| `NOT_AUTHENTICATED` | 401 | `Authentication required` | — |
| `SESSION_EXPIRED` | 401 | `Session is invalid or expired` | — |
| `NO_PERMISSION_DECLARED` | 403 | `Route declares no permissions and is denied by default` | — |
| `MISSING_PERMISSION` | 403 | ``Missing permission: ${missing.join(', ')}`` | — |

The explicit envelope is `{ statusCode, code, message, ...extra }`. Keep
`RESEND_COOLDOWN`/`OTP_INVALID` as their current Nest exceptions because their extra fields are
top-level, whereas `DomainError.details` would change the wire. Boundary `VALIDATION_ERROR` remains
`400 Invalid request payload` with flattened zod details. The framework throttle response remains
`{ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }`.

### Frozen ports, exports, and cross-module seams

- Keep symbol identity and the public signatures of `SESSION_STORE`, `AUTH_CHALLENGE_STORE`,
  `AUTH_EMAIL_SENDER`, `PASSWORD_HASHER`, `PERMISSION_RESOLVER`, and `SESSION_INFO_READER`.
- `SESSION_STORE` remains:

```ts
create(userId: string, meta: { ip?: string; userAgent?: string }): Promise<SessionTokens>
findByAccessToken(accessToken: string): Promise<SessionPrincipal | null>
rotate(refreshToken: string): Promise<SessionTokens | null>
revoke(sessionId: string): Promise<void>
revokeAllForUser(userId: string): Promise<void>
```

- `AUTH_CHALLENGE_STORE` keeps its exact payload/result unions:

```ts
issue(payload: AuthChallengePayload): Promise<IssuedAuthChallenge>
resend(challengeId: string, purpose: AuthChallengePurpose): Promise<
  | { status: 'issued'; challenge: IssuedAuthChallenge; payload: AuthChallengePayload }
  | { status: 'cooldown'; retryAfterSec: number }
  | { status: 'expired' }
>
verify(challengeId: string, purpose: AuthChallengePurpose, otp: string): Promise<
  | { status: 'verified'; completionToken: string; expiresInSec: number }
  | { status: 'invalid'; attemptsRemaining: number }
  | { status: 'expired' }
  | { status: 'locked' }
>
consumeCompletion(
  completionToken: string,
  purpose: AuthChallengePurpose,
): Promise<AuthChallengePayload | null>
```

- `PERMISSION_RESOLVER.resolve(userId, { tenantId?, partnerId? })` and the partner consumer's
  single-argument `invalidate(userId)` stay exact. Do not change the `perms:*` Redis key format.
- `IdentityAccessModule` exports exactly
  `[SESSION_STORE, PERMISSION_RESOLVER, FindOrCreateGuestUseCase]`. Keep provider/guard ordering:
  `SessionAuthGuard`, then `PermissionsGuard`; the app-level `ThrottlerGuard` remains outside this
  module.
- Booking directly imports and injects
  `identity-access/application/use-cases/find-or-create-guest.use-case`. Keep:

```ts
FindOrCreateGuestUseCase.execute(input: {
  email: string;
  fullName: string;
  phone: string;
}): Promise<UserRecord>
```

  It continues to run before booking's tenant transaction/validation and throws the same
  `EMAIL_REGISTERED` variant.
- Keep `SessionPrincipal` as the existing narrow joined projection on the every-request guard path.
  Do not load a `UserAccount`, add a query, or expose hashes there.
- App-wide decorator/import seams remain exact: `Public`, `AuthenticatedOnly`, `CurrentPrincipal`,
  `OptionalPrincipal`, and `RequirePermissions`. Booking's public controller continues to use
  `OptionalPrincipal`.
- Identity-access continues to synchronously use notification's `EMAIL_SENDER` via
  `NotificationModule`; do not introduce an outbox event.
- `permission-catalog.ts` remains live seed/reference data (51 permission keys, 7 roles), not an
  aggregate, and its import path stays exact.

### Frozen HTTP/security surface

- Keep all 15 routes and their decorators/status codes. Only the eight OTP endpoints
  (registration/password-reset start, resend, verify, complete) and `upgrade-guest`/`login` have
  explicit 60-second throttles (`5/3/10/5` and `10/10` respectively). `/register`, `/refresh`,
  `/logout`, `/me`, and `/session` use only the app-global 100/min limit.
- Cookie names/options remain exact: `sid` and `rid`, `httpOnly`, `sameSite: 'lax'`, secure unless
  `COOKIE_SECURE === 'false'`; both expire at `refreshExpiresAt`; `sid` path `/`, `rid` path `/auth`;
  clearing uses those same paths. No Bearer/JWT authentication is introduced.
- Public routes with a presented `sid` keep best-effort principal loading. Invalid, expired, revoked,
  or suspended principals stay anonymous on public routes; protected routes retain
  `NOT_AUTHENTICATED` versus `SESSION_EXPIRED` behavior.
- Permission guard public/auth-only short-circuits, deny-by-default behavior, scope resolution, and
  TenantContext seeding order remain untouched.

### Anti-enumeration, persistence, and concurrency freeze

- Password-reset start always issues and returns a success-shaped challenge. Unknown emails and
  guest identities omit `userId`, send no email, and remain indistinguishable from real accounts.
- Password-reset resend emails only registration challenges or reset challenges carrying `userId`.
  Completion with no `userId` returns `{ success: true }` without hashing, writing, or revoking.
- Email uniqueness remains enforced by the global citext unique index. The three pre-checks remain
  check-then-insert. Current concurrent-create `P2002` is **not translated** and still propagates as
  the current 500; adding a 409 mapping is a behavior follow-up, not part of this refactor.
- Login lockout remains read → verify → unguarded `updateLockout`, without transaction, row lock,
  atomic increment, or CAS. Concurrent failures may lose increments.
- Session refresh remains `findUnique(old refresh hash)` → unguarded update-by-id replacing both
  hashes. Do not add a transaction/CAS/version predicate. Interleavings may reject the second
  lookup, or allow both callers to return tokens while only the final write remains usable.
- Preserve app-clock boundaries and strict expiry comparisons (`expiresAt <= now` is invalid).
- Keep session unique constraints on both hashes. Keep revoke-all as one set-based `updateMany`; do
  not load N `Session` aggregates.
- Redis keys stay byte-identical:
  `identity:auth-challenge:${challengeId}` and
  `identity:auth-completion:${sha256(completionToken)}`.
- Stored challenge JSON stays unversioned and shape-compatible:
  `{ purpose, email, locale, fullName?, userId?, otpHash, attempts, resendAt }`.
- Preserve OTP TTL 600s, resend cooldown 60s, completion TTL 1800s, max attempts 5, six-digit
  zero-padded OTPs, `Math.ceil` cooldown rounding, remaining Redis TTL on invalid attempts, atomic
  `MULTI DEL + SET` on success, and `GETDEL` before purpose validation on completion.
- Purpose mismatch remains `expired`; a wrong-purpose completion attempt still consumes the token.
  Do not “repair” this observable behavior in the refactor.
- Keep the other Redis races too: correct verifies may both mint completion tokens after concurrent
  reads, invalid attempts may lose increments, and concurrent resends may email different OTPs while
  only the last write remains valid.

---

## Task 1 — Domain: UserAccount state, policy, and typed errors

**Files**

- Create `apps/api/src/modules/identity-access/domain/errors/identity-access-errors.ts`
- Create `apps/api/src/modules/identity-access/domain/entities/user-account.entity.ts`

**UserAccount**

- Narrow tolerant state: `id`, `email`, `passwordHash`, `fullName`, `phone`, `locale`, `status`,
  `failedLoginCount`, `lockedUntil`, `emailVerifiedAt`.
- `static rehydrate(state)` copies without validating legacy data.
- `static register(...)` creates a password account while accepting the current flow's
  `emailVerifiedAt` choice: legacy `/register` leaves it null; verified completion supplies the
  app-clock date. `static createGuest(...)` owns `passwordHash: null`, locale `vi`, active status,
  and reset lockout defaults.
- A domain availability guard owns `EMAIL_TAKEN`, but the DB index remains the final arbiter.
- Password-login gate preserves exact order: locked → suspended → passwordless guest. It receives
  `now`; the guest branch uses `INVALID_CREDENTIALS`.
- `recordLoginFailure(now)` reproduces the existing policy exactly: attempts 1–4 increment; the
  fifth resets the counter to `0` and sets `lockedUntil` to `now + 15 minutes`.
- `recordLoginSuccess()` resets count/lock.
- Guest reuse and guest upgrade are separate methods so the two frozen `EMAIL_REGISTERED` messages
  cannot collapse. Missing upgrade target throws the frozen `GUEST_NOT_FOUND`.
- Password changes expose only the next password hash; do not model plaintext passwords.
- Do not add a status transition graph, email normalization, password-strength validation, or
  suspended-session revocation.

**Errors**

- Typed 4xx `DomainError` classes only for the table entries that have no top-level extra fields and
  are owned by `UserAccount`: email taken, the two email-registered variants, guest not found,
  invalid credentials, account locked, and account suspended.
- Challenge errors with top-level extras remain in their application mappers. Refresh errors remain
  unchanged throughout this PR.

**Verify/commit/review gate**

1. `pnpm --filter=@booking/api typecheck`.
2. Commit only Task 1 files.
3. Review package: requirements, commit/diff range, command output, exact error-table checklist.
4. Independent reviewer checks framework-free imports, tolerant rehydrate, clock injection,
   lockout math/order, guest message variants, and absence of plaintext credentials.
5. Fix and re-review every finding before Task 2.

---

## Task 2 — UserAccount persistence + registration and guest flows

**Files**

- Modify `domain/ports/user-repository.port.ts`
- Modify `infrastructure/repositories/prisma-user.repository.ts`
- Refactor `register`, `start-registration`, `complete-registration`,
  `find-or-create-guest`, and `upgrade-guest`
- Add a narrow application mapper only if required to preserve the existing `UserRecord` result
  shape; do not move or change the controller response mapper

**Port/repository**

- Preserve `USER_REPOSITORY` symbol identity. The port is small, so keep it unified rather than
  splitting a reader/writer pair.
- Keep the exported `UserRecord` structural shape exact:
  `{ id,email,passwordHash,fullName,phone,locale,status,failedLoginCount,lockedUntil,emailVerifiedAt }`;
  booking's direct use-case consumer must not receive a class/private-state object.
- Repository reads rehydrate `UserAccount`; creates consume a narrow new-account intent and map back
  to the exact `UserRecord` shape needed by controllers and booking.
- Keep `setPassword(userId: string, passwordHash: string): Promise<UserRecord>` exact throughout all
  task gates. Both guest upgrade and password-reset completion use it; changing one caller/port
  before the other would make an intermediate commit fail typecheck.
- Keep writes column-granular. Never introduce a full-state save that could clobber password,
  lockout, status, or profile fields.
- Continue using `prisma.admin` directly. No transaction parameter or `forTenant`.
- Preserve `create` versus guest creation behavior and Prisma defaults/timestamps. Keep all current
  pre-check ordering and leave concurrent `P2002` unhandled.

**Use-case behavior**

- Register: pre-check → Argon2 hash → domain registration intent → create → session create. It does
  not set `emailVerifiedAt`. Exact response and cookies remain controller-owned; session failure
  continues to leave the account created.
- Start registration: pre-check before issuing/sending; `EMAIL_TAKEN` remains before challenge work.
- Complete registration: consume completion; missing/invalid payload still throws
  `CHALLENGE_EXPIRED`; preserve the exact `!payload?.fullName` truthiness guard; pre-check; hash;
  create with `emailVerifiedAt: new Date()` from the same app-clock boundary. Do not reorder
  challenge consumption and uniqueness checks, and do not create a session.
- Guest checkout: existing password account throws the booking-specific message; existing guest is
  returned unchanged; missing email creates the domain guest defaults. Keep the exact exported
  use-case path/signature/result.
- Guest upgrade: missing → `GUEST_NOT_FOUND`; password account → upgrade-specific
  `EMAIL_REGISTERED`; then hash → password-column update → session create. No added verification,
  email flag, profile update, session revocation, or transaction. Keep concurrent last-password-write
  wins behavior.

**Verify/commit/review gate**

1. API typecheck + lint for the full identity-access module.
2. Commit Task 2.
3. Independent reviewer checks admin-pool boundary, column-granular writes, raw `P2002`, operation
   ordering, both cross-module guest contracts, exact output record, and no controller drift.
4. Fix/re-review before Task 3.

---

## Task 3 — Login and password-reset orchestration through UserAccount

**Files**

- Refactor `application/use-cases/login.use-case.ts`
- Refactor `application/use-cases/start-password-reset.use-case.ts`
- Refactor `application/use-cases/complete-password-reset.use-case.ts`
- Adjust `domain/ports/user-repository.port.ts` and
  `infrastructure/repositories/prisma-user.repository.ts` only for narrow lockout intents;
  `setPassword(userId, passwordHash)` remains exact
- Delete `domain/login-lockout.ts` after all callers move to `UserAccount`

**Login**

- Keep missing-email and passwordless-account failures indistinguishable as
  `INVALID_CREDENTIALS`.
- Capture app `now` at the same point as today, then apply gates in exact locked → suspended →
  guest order.
- Argon2 verification remains outside the entity.
- Invalid password: entity records failure → repository performs the same unguarded field update →
  use-case throws `INVALID_CREDENTIALS`. Persist before throwing.
- Valid password: entity resets lockout → same update → session create. Do not skip the success
  write even when the stored lockout is already reset.

**Password reset**

- Start keeps the deliberate anti-enumeration branch: always issue; add `userId/fullName` and send
  only when `Boolean(user?.passwordHash)` is true. Do not replace this with
  `passwordHash !== null`; a tolerant legacy empty string must remain on the no-email path.
- Complete keeps `GETDEL`/expired handling first. Missing `userId` returns success immediately,
  before hash/write/revoke.
- With `userId`: hash → narrow password-column update → set-based revoke-all → success. Do not add a
  user pre-read or guest/account check; the challenge payload is the existing authorization fact,
  and adding a query changes deletion/race behavior.
- Resend eligibility remains exact:
  `purpose === 'registration' || Boolean(payload.userId)`.

**Verify/commit/review gate**

1. API typecheck + full module lint.
2. Commit Task 3.
3. Independent reviewer checks exception bytes, gate/order equivalence, lockout lost-update race,
   persist-before-throw, anti-enumeration, no new user read, and deletion of only truly dead lockout
   helpers.
4. Fix/re-review before Task 4.

---

## Task 4 — Session aggregate behind the frozen store

**Files**

- Create `domain/entities/session.entity.ts`
- Refactor `infrastructure/services/prisma-session.store.ts`
- Leave `application/use-cases/refresh-session.use-case.ts` and its two Nest errors unchanged

**Session**

- Narrow state: `id`, `userId`, both token hashes, both expiries, `revokedAt`, `ip`, `userAgent`.
- Domain constants remain exactly 15 access minutes and 30 refresh days.
- `static issue({ userId, accessTokenHash, refreshTokenHash, meta, now })` returns hashed
  `NewSession`; it never receives plaintext tokens.
- `static rehydrate(state)` is tolerant.
- Access validity and refresh eligibility are `revokedAt === null && expiresAt > now`.
- Rotation receives only next hashes + app `now` and returns the replacement state for both hashes
  and expiries. A static/narrow revoke intent receives app `now`.
- A static/narrow revoke-all intent may state the policy, but persistence stays one `updateMany`.

**Adapter**

- Token generation remains 32 random bytes encoded as lowercase hex; persisted values remain
  SHA-256 hex hashes.
- `create` and `rotate` return the same `SessionTokens` plaintext shape transiently.
- `findByAccessToken` keeps one existing joined query and returns the exact `SessionPrincipal`
  projection. It may apply narrow Session validity policy in memory, but must not load a
  `UserAccount`, add a query, or expose hashes.
- Preserve `findUnique` then unguarded update-by-id rotation. No CAS, transaction, version, or
  conditional update.
- Preserve the current app-clock sampling and strict `<=` expiry rejection: create samples
  `Date.now()` after generating both tokens; access validation samples `new Date()` after the query;
  rotate eligibility samples `new Date()` after the query, then replacement expiries sample a later
  `Date.now()` after generating both next tokens.
- Revoke remains one direct `update({ where: { id }, data: { revokedAt: new Date() } })`: no
  pre-read, rehydrate, or extra query; preserve Prisma not-found behavior. Preserve revoke-all's
  single set-based `updateMany` shape.

**Verify/commit/review gate**

1. API typecheck + full module lint.
2. Commit Task 4.
3. Independent reviewer checks hash-only state, exact token encoding/TTLs, one-query principal hot
   path, both-hash rotation, race shape, app clock, store signatures, and module export identity.
4. Fix/re-review before Task 5.

---

## Task 5 — AuthChallenge aggregate behind the frozen Redis protocol

**Files**

- Create `domain/entities/auth-challenge.entity.ts`
- Refactor `infrastructure/services/redis-auth-challenge.store.ts`
- Touch `resend-otp.base.ts`, `verify-otp.base.ts`, and `auth-challenge.helpers.ts` only if needed to
  consume unchanged result unions; their HTTP mapping bytes must remain exact

**AuthChallenge**

- Narrow state mirrors the live Redis JSON exactly:
  `purpose`, `email`, `locale`, optional `fullName/userId`, `otpHash`, `attempts`, `resendAt`.
- Domain constants: OTP TTL 600s, resend cooldown 60s, completion TTL 1800s, max attempts 5.
- `static issue(payload, otpHash, nowMs)` creates attempts `0` and exact `resendAt`. The adapter
  samples `nowMs` only after generating the OTP and hash, matching the current call order.
- Resend policy computes `Math.ceil((resendAt - nowMs) / 1000)`; positive means cooldown. An issued
  resend creates a fresh OTP hash, resets attempts, and resets the 600s TTL on the same challenge id.
  Preserve two clock samples: `decisionNowMs` for cooldown, then a later `issuedNowMs` after the new
  OTP/hash generation for the replacement `resendAt`; do not reuse the decision clock.
- Verify consumes a boolean `otpMatches` fact from the adapter. Success, invalid, and locked are
  no-throw result transitions; the fifth failure locks/destroys. The entity never sees plaintext OTP
  or completion token.
- Missing Redis state, Redis TTL expiration, and purpose mismatch remain adapter concerns mapped to
  `{ status: 'expired' }`.

**Redis adapter/protocol**

- Keep random six-digit zero-padded OTPs and base64url 32-byte challenge/completion tokens.
- Keep SHA-256 and `timingSafeEqual` in the adapter.
- Preserve exact key prefixes, JSON payload compatibility, result-union field names, and
  `payloadOf` optional-field behavior.
- Successful verify remains one Redis `MULTI`: delete challenge + set hashed completion key with
  1800s expiry.
- Invalid verify increments once, deletes at zero remaining, otherwise reads current TTL and rewrites
  with that TTL; `ttl <= 0` returns expired.
- Completion remains `GETDEL` first, then purpose check. Wrong-purpose consumption remains destructive.
- Keep resend and verify's existing non-transactional read/decision windows; do not add Lua/CAS.
- Keep email sending and HTTP mapping in application use-cases. Anti-enumeration and top-level error
  extras remain exact.

**Verify/commit/review gate**

1. API typecheck + full identity-access lint + `git diff --check`.
2. Commit Task 5.
3. Independent reviewer checks Redis wire compatibility, optional-field serialization, TTL/cooldown
   math, attempt boundary, atomic success, destructive wrong-purpose consume, hash/timing secrecy,
   result unions, and exact HTTP extras.
4. Fix/re-review every finding.

---

## Final review and PR gate

1. Prepare a whole-branch review package from the plan commit to branch head:
   commit list, diff stat, frozen tables/seams, per-task review dispositions, and verification logs.
2. A reviewer separate from the task implementer/reviewer audits the entire branch against the
   design spec, survey, and this plan. Carry no unresolved P0–P3 finding.
3. Run with Node 22.22.0:

```bash
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
pnpm turbo lint typecheck build
git diff --check refactor/entity-centric...HEAD
```

4. Manual runtime on a free API port:
   - real login and invalid-login lockout path;
   - access-cookie authenticated `/auth/me` and refresh rotation/replay rejection;
   - logout and revoked-session rejection;
   - registration start/resend cooldown/invalid OTP attempt/success completion;
   - password reset for a real account and a nonexistent email, confirming indistinguishable public
     responses and no email for the nonexistent identity;
   - guest checkout reuse/rejection and guest upgrade;
   - one protected route to confirm both global guard order and permission resolution.
5. Inspect Mailpit for only the expected real-account/registration OTP deliveries. Do not expose OTP,
   sid/rid, refresh tokens, hashes, or passwords in the PR body/log excerpt.
6. PR base is `refactor/entity-centric`. The body must explicitly list anything not runtime-verified,
   the current raw `P2002` uniqueness race; lockout lost increments; refresh last-write-wins;
   guest-upgrade last-password-write-wins; Redis double-verify/lost-attempt/concurrent-resend races;
   and destructive wrong-purpose completion behavior as preserved follow-ups—not as fixes.
