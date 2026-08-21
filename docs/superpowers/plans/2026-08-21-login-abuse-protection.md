# Login Abuse Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace persistent account-wide password lockout with trusted-client-IP, Redis-backed source-scoped login abuse protection so an attacker cannot remotely lock a victim account while BookingOS still resists repeated guessing and credential spraying.

**Architecture:** Caddy remains the public trust boundary and overwrites an application-specific client-IP header. Storefront/dashboard BFF login calls validate and forward only that trusted IP. The API parses it, applies Redis sliding-window pair/IP limits plus account-observation telemetry, and never writes account-wide lockout state during password login. Runtime limiter failures fail open for availability; production secret misconfiguration fails fast at boot.

**Tech Stack:** Caddy 2, React Router 8 SSR, NestJS 11, ioredis, Redis Lua/EVAL, Argon2, Zod, Prisma 6/PostgreSQL, nestjs-pino, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-08-21-login-abuse-protection-design.md`

## Global Constraints

- Security invariant: an unauthenticated source must not be able to create persistent account state that prevents a victim with the correct password from logging in from an unrelated trusted client IP.
- Remove account-wide lockout from password-login decisions; `failed_login_count` and `locked_until` stay in the database but become inert for login.
- Bucket A is exactly 5 failed attempts / 10 minutes for trusted client IP + normalized email.
- Bucket B is exactly 30 failed attempts / 10 minutes for trusted client IP.
- Bucket C observes 20 failed attempts / 10 minutes and requires at least 3 distinct hashed client IPs before emitting distributed-attack suspicion; it never blocks authentication.
- Only failed password-login attempts consume limiter budgets. A successful login clears only the exact pair bucket and never clears the IP-wide or account-observation buckets.
- Unknown email and wrong password stay externally indistinguishable (`401 INVALID_CREDENTIALS`).
- Source limiter rejection is `429 AUTH_RATE_LIMITED` and must not reveal which bucket fired, exact counts, email existence, raw IP/email, or Redis identifiers.
- Caddy must overwrite `X-BookingOS-Client-IP`; browser-supplied values must never survive the public edge unchanged.
- Do not enable Express/Nest global `trust proxy` as part of this task.
- BFFs accept only one IPv4/IPv6 literal; missing, comma-separated, or malformed values are omitted from the backend login request.
- Missing/malformed trusted client IP at the API skips source limiting and emits `auth.login.client_ip_unavailable`; never substitute the frontend/container socket peer.
- Redis limiter runtime failures fail open for credential verification and emit `auth.login.limiter_unavailable`.
- `AUTH_RATE_LIMIT_HMAC_KEY` is required and strong in production; a missing/unsafe production key must fail process startup.
- Redis keys/logs must not contain raw email or IP. Use domain-separated HMAC-SHA-256 identifiers.
- Never log passwords, submitted auth headers, session tokens, HMAC secret material, raw email/IP, or full Redis keys.
- ADR 0005 (`docs/decisions/0005-no-tests-policy.md`) forbids automated test files/runners. Do not add Jest, Vitest, Playwright, `*.test.*`, or `*.spec.*` files. Use static gates plus temporary disposable runtime-smoke workflow/scripts, then delete the temporary workflow before final source-only verification.
- No Prisma migration in AUTH-001.
- No deploy, merge, or production rollout unless separately authorized.
- At execution time create isolated branch `fix/auth-001-login-abuse-protection` from this approved design/plan branch head. If `main` has moved, compare/rebase before product-code commits instead of silently implementing against a stale base.

## File map

### Edge and BFF trust boundary

- `docker/caddy/Caddyfile` — overwrite the canonical trusted client-IP header on every public reverse proxy path.
- `apps/storefront/app/lib/server/trusted-client-ip.server.ts` — validate one trusted IP literal from the incoming storefront request.
- `apps/storefront/app/lib/server/api-request.server.ts` — add a login-only request-options builder that forwards trusted client IP.
- `apps/storefront/app/lib/server/api.server.ts` — route `backendLogin()` through the login-only request options.
- `apps/dashboard/app/lib/trusted-client-ip.server.ts` — dashboard equivalent trusted-IP parser.
- `apps/dashboard/app/lib/api.server.ts` — accept `Request` in `backendLogin()` and forward only the validated trusted IP.
- `apps/dashboard/app/routes/auth/login.tsx` — pass the current request into `backendLogin()`.

### API limiter boundary

- `apps/api/src/modules/identity-access/infrastructure/http/trusted-client-ip.ts` — parse the canonical header without falling back to `req.ip`.
- `apps/api/src/modules/identity-access/domain/ports/login-abuse-protection.port.ts` — stable application-facing limiter contract and safe HMAC identifiers.
- `apps/api/src/modules/identity-access/infrastructure/services/redis-login-abuse-protection.service.ts` — HMAC key derivation, production config guard, Redis sliding windows, atomic pair/IP mutations, account observation.
- `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts` — bind the limiter port to Redis implementation.
- `apps/api/src/modules/identity-access/domain/errors/identity-access-errors.ts` — add `AuthRateLimited`.
- `apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts` — fail-open limiter orchestration, telemetry, credential verification, no persistent lockout mutation.
- `apps/api/src/modules/identity-access/domain/entities/user-account.entity.ts` — remove `lockedUntil` from `assertCanPasswordLogin()` while preserving suspended/passwordless rules.
- `apps/api/src/modules/identity-access/infrastructure/http/public-auth.controller.ts` — use the canonical header for login session metadata/limiter input; do not use `@Ip()` for login.
- `apps/api/src/shared/http/throttle-limits.ts` — correct stale comment: Nest throttler remains capacity ceiling; login abuse control now lives in the dedicated Redis limiter.

### User-facing copy and configuration

- `packages/i18n/src/locales/vi/auth.ts` — replace `errors.accountLocked` with `errors.rateLimited`.
- `packages/i18n/src/locales/en/auth.ts` — matching English key/copy.
- `apps/storefront/app/features/auth/components/auth-form-controls.tsx` — map `AUTH_RATE_LIMITED` to new copy and stop mapping `ACCOUNT_LOCKED`.
- `apps/dashboard/app/routes/auth/login.tsx` — dashboard copy for `AUTH_RATE_LIMITED`, no account-lockout claim.
- `.env.example` — documented development HMAC-key behavior/example.
- `.env.deploy.example` — required production secret and generation command.
- `docker-compose.deploy.yml` — require/inject `AUTH_RATE_LIMIT_HMAC_KEY` into API container.
- `docs/deployment.md` — production secret/trust-boundary rollout note.

### Temporary verification only

- `.github/workflows/auth-001-runtime-smoke.yml` — disposable runtime acceptance workflow; MUST be deleted before final source-only CI.

---

### Task 1: Establish the trusted client-IP chain from Caddy through both BFFs

**Files:**
- Modify: `docker/caddy/Caddyfile`
- Create: `apps/storefront/app/lib/server/trusted-client-ip.server.ts`
- Modify: `apps/storefront/app/lib/server/api-request.server.ts`
- Modify: `apps/storefront/app/lib/server/api.server.ts`
- Create: `apps/dashboard/app/lib/trusted-client-ip.server.ts`
- Modify: `apps/dashboard/app/lib/api.server.ts`
- Modify: `apps/dashboard/app/routes/auth/login.tsx`

**Interfaces:**
- Produces canonical header name: `x-bookingos-client-ip`.
- Produces in both BFFs:

```ts
export const BOOKINGOS_CLIENT_IP_HEADER = 'x-bookingos-client-ip';
export function trustedClientIpFromRequest(request: Request): string | undefined;
export function trustedClientIpHeaders(request: Request): Record<string, string>;
```

- Storefront produces:

```ts
export function storefrontLoginOptions(request: Request): AuthRequestOptions;
```

- Dashboard changes:

```ts
backendLogin(request: Request, credentials: { email: string; password: string })
```

- [ ] **Step 1: Add the storefront trusted-IP parser**

Create `apps/storefront/app/lib/server/trusted-client-ip.server.ts` using Node's IP parser, not a hand-written IPv6 regex:

```ts
import { isIP } from 'node:net';

export const BOOKINGOS_CLIENT_IP_HEADER = 'x-bookingos-client-ip';

export function trustedClientIpFromRequest(request: Request): string | undefined {
  const raw = request.headers.get(BOOKINGOS_CLIENT_IP_HEADER)?.trim();
  if (!raw || raw.includes(',') || isIP(raw) === 0) return undefined;
  return raw;
}

export function trustedClientIpHeaders(request: Request): Record<string, string> {
  const clientIp = trustedClientIpFromRequest(request);
  return clientIp ? { [BOOKINGOS_CLIENT_IP_HEADER]: clientIp } : {};
}
```

Do not fall back to `x-forwarded-for`, `cf-connecting-ip`, `request.url`, or a form field.

- [ ] **Step 2: Add a login-only storefront request-options builder**

In `api-request.server.ts`, leave `storefrontAuthOptions()` semantics unchanged for register/refresh/logout and add:

```ts
import type { AuthRequestOptions } from '@booking/api-client';
import { trustedClientIpHeaders } from './trusted-client-ip.server';

export function storefrontLoginOptions(request: Request): AuthRequestOptions {
  return {
    ...storefrontAuthOptions(request),
    headers: {
      ...storefrontAuthOptions(request).headers,
      ...trustedClientIpHeaders(request),
    },
  };
}
```

Avoid forwarding the special header on every backend call; AUTH-001 only needs password login.

- [ ] **Step 3: Route storefront login through the new options**

In `apps/storefront/app/lib/server/api.server.ts`:

```ts
import {
  storefrontAuthOptions,
  storefrontLoginOptions,
  storefrontRequestOptions,
} from './api-request.server';

export const backendLogin = (request: Request, credentials: { email: string; password: string }) =>
  apiClient.login(credentials, storefrontLoginOptions(request));
```

Leave register/refresh/logout on `storefrontAuthOptions(request)`.

- [ ] **Step 4: Add the equivalent dashboard trusted-IP parser**

Create `apps/dashboard/app/lib/trusted-client-ip.server.ts` with the same three exports and exactly the same validation semantics as the storefront file. Duplication is intentional and tiny; do not create a cross-app package solely for a 10-line server-only trust-boundary helper.

- [ ] **Step 5: Make dashboard login request-aware**

In `apps/dashboard/app/lib/api.server.ts`:

```ts
import { trustedClientIpHeaders } from './trusted-client-ip.server';

export function backendLogin(
  request: Request,
  credentials: { email: string; password: string },
) {
  return client().login(credentials, {
    signal: request.signal,
    requestId: request.headers.get('x-request-id') ?? undefined,
    headers: trustedClientIpHeaders(request),
  });
}
```

Then change the dashboard login action from:

```ts
const result = await backendLogin(parsed.data);
```

to:

```ts
const result = await backendLogin(request, parsed.data);
```

- [ ] **Step 6: Overwrite the header at every public Caddy reverse proxy**

For every public `reverse_proxy` that sends traffic to `dashboard:3000`, `storefront:3000`, or `api:3000`, convert the one-line form to a block when needed and add:

```caddyfile
reverse_proxy dashboard:3000 {
	header_up X-BookingOS-Client-IP {remote_host}
}
```

Use the same `header_up` line for API/storefront targets. Do not add it to the on-demand TLS `ask http://api:3000/...` call; that internal certificate authorization request is not a user login path.

The result must cover:

```text
{$DASHBOARD_HOST} -> dashboard
{$API_HOST} -> api
{$PLATFORM_BASE_DOMAIN} -> storefront
catch-all admin.* -> dashboard
catch-all storefront -> storefront
```

- [ ] **Step 7: Validate this task without adding tests**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck

docker run --rm \
  -e ACME_EMAIL=ops@example.invalid \
  -e DASHBOARD_HOST=admin.example.invalid \
  -e API_HOST=api.example.invalid \
  -e PLATFORM_BASE_DOMAIN=example.invalid \
  -v "$PWD/docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit the trust-boundary slice**

```bash
git add docker/caddy/Caddyfile \
  apps/storefront/app/lib/server/trusted-client-ip.server.ts \
  apps/storefront/app/lib/server/api-request.server.ts \
  apps/storefront/app/lib/server/api.server.ts \
  apps/dashboard/app/lib/trusted-client-ip.server.ts \
  apps/dashboard/app/lib/api.server.ts \
  apps/dashboard/app/routes/auth/login.tsx
git commit -m "fix(auth): propagate trusted login client ip"
```

---

### Task 2: Define the API limiter contract, error, trusted-header parser, and secret guard

**Files:**
- Create: `apps/api/src/modules/identity-access/infrastructure/http/trusted-client-ip.ts`
- Create: `apps/api/src/modules/identity-access/domain/ports/login-abuse-protection.port.ts`
- Modify: `apps/api/src/modules/identity-access/domain/errors/identity-access-errors.ts`
- Modify: `.env.example`
- Modify: `.env.deploy.example`
- Modify: `docker-compose.deploy.yml`
- Modify: `docs/deployment.md`

**Interfaces:**

```ts
export const LOGIN_ABUSE_PROTECTION = Symbol('LOGIN_ABUSE_PROTECTION');
export type LoginRateLimitScope = 'pair' | 'ip';

export interface LoginAbuseIdentifiers {
  pairId: string;
  ipId: string;
  accountId: string;
}

export interface LoginAbusePrecheckResult {
  identifiers: LoginAbuseIdentifiers;
  limitedScope: LoginRateLimitScope | null;
}

export interface DistributedAttackSignal {
  activeFailures: number;
  distinctSources: number;
}

export interface LoginAbuseFailureResult {
  identifiers: LoginAbuseIdentifiers;
  distributedAttack: DistributedAttackSignal | null;
}

export interface ILoginAbuseProtection {
  precheck(input: { normalizedEmail: string; clientIp: string }): Promise<LoginAbusePrecheckResult>;
  recordFailure(input: {
    normalizedEmail: string;
    clientIp: string;
  }): Promise<LoginAbuseFailureResult>;
  clearPair(input: { normalizedEmail: string; clientIp: string }): Promise<void>;
}
```

- [ ] **Step 1: Add the API trusted-header parser**

Create `trusted-client-ip.ts`:

```ts
import { isIP } from 'node:net';

export const BOOKINGOS_CLIENT_IP_HEADER = 'x-bookingos-client-ip';

export function parseTrustedClientIpHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return undefined;
  const normalized = value?.trim();
  if (!normalized || normalized.includes(',') || isIP(normalized) === 0) return undefined;
  return normalized;
}
```

Never use `req.ip` as a fallback in this helper.

- [ ] **Step 2: Add the limiter port**

Create `login-abuse-protection.port.ts` with the interfaces above. Keep Redis, HMAC, Logger, and Nest imports out of this domain port.

- [ ] **Step 3: Add the stable 429 domain error**

In `identity-access-errors.ts`:

```ts
export class AuthRateLimited extends DomainError {
  constructor() {
    super('AUTH_RATE_LIMITED', 429, 'Too many login attempts. Please try again later.');
  }
}
```

Leave `AccountLocked` defined for compatibility in this task; product login simply stops throwing it later. Removing the obsolete class belongs to the future schema/domain cleanup.

- [ ] **Step 4: Document the development HMAC secret**

Under Redis/secrets in `.env.example`, add:

```dotenv
# HMAC key for privacy-preserving login-abuse Redis identifiers.
# dev: this explicit value is safe only for local development.
# stg+prod: REQUIRED, unique secret, generate with `openssl rand -hex 32`.
AUTH_RATE_LIMIT_HMAC_KEY=dev-auth-rate-limit-hmac-key-not-for-production
```

- [ ] **Step 5: Add the required deploy secret**

In `.env.deploy.example` under Secrets:

```dotenv
# HMAC-SHA-256 key for login-abuse source/account identifiers.
# Generate: openssl rand -hex 32
# Keep the same value across all API replicas in one environment.
AUTH_RATE_LIMIT_HMAC_KEY=CHANGE_ME_generate_with_openssl_rand_hex_32
```

In `docker-compose.deploy.yml`, API environment:

```yaml
AUTH_RATE_LIMIT_HMAC_KEY: ${AUTH_RATE_LIMIT_HMAC_KEY:?AUTH_RATE_LIMIT_HMAC_KEY is required}
```

Do not inject this secret into storefront/dashboard/Caddy.

- [ ] **Step 6: Add deployment documentation**

In `docs/deployment.md`, document:

```text
AUTH_RATE_LIMIT_HMAC_KEY
- API-only secret.
- Generate with: openssl rand -hex 32
- Same value across API replicas in one environment.
- Rotation only invalidates current Redis abuse-history identifiers; it does not affect user passwords or sessions.
- Caddy is the trust boundary for X-BookingOS-Client-IP. If a CDN/LB is added before Caddy, configure trusted proxy handling before relying on this signal.
```

Do not claim the current architecture already supports a CDN/LB in front of Caddy.

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck

docker compose --env-file .env.deploy.example -f docker-compose.deploy.yml config >/tmp/auth001-compose.yml
```

The compose command may require replacing unrelated `CHANGE_ME` placeholders only if Compose validation rejects them; it must confirm the new API env key is wired and no secret is exposed to other services.

Then commit:

```bash
git add apps/api/src/modules/identity-access/infrastructure/http/trusted-client-ip.ts \
  apps/api/src/modules/identity-access/domain/ports/login-abuse-protection.port.ts \
  apps/api/src/modules/identity-access/domain/errors/identity-access-errors.ts \
  .env.example .env.deploy.example docker-compose.deploy.yml docs/deployment.md
git commit -m "feat(auth): define login abuse protection boundary"
```

---

### Task 3: Implement the Redis sliding-window limiter with HMAC identifiers

**Files:**
- Create: `apps/api/src/modules/identity-access/infrastructure/services/redis-login-abuse-protection.service.ts`
- Modify: `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts`

**Consumes:** `ILoginAbuseProtection` and `LOGIN_ABUSE_PROTECTION` from Task 2; global `REDIS` provider from `apps/api/src/shared/redis/redis.module.ts`.

**Produces:** `RedisLoginAbuseProtectionService` bound to `LOGIN_ABUSE_PROTECTION`.

**Exact constants:**

```ts
const WINDOW_MS = 10 * 60 * 1_000;
const PAIR_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 30;
const ACCOUNT_OBSERVE_LIMIT = 20;
const ACCOUNT_DISTINCT_SOURCE_LIMIT = 3;
const DEV_HMAC_KEY = 'dev-auth-rate-limit-hmac-key-not-for-production';
const MIN_PRODUCTION_HMAC_KEY_LENGTH = 32;
```

- [ ] **Step 1: Add production HMAC-key validation and privacy-safe identifiers**

Use:

```ts
import { createHmac, randomUUID } from 'node:crypto';

function loadHmacKey(): string {
  const configured = process.env.AUTH_RATE_LIMIT_HMAC_KEY?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (
      !configured ||
      configured.length < MIN_PRODUCTION_HMAC_KEY_LENGTH ||
      configured === DEV_HMAC_KEY ||
      configured.startsWith('CHANGE_ME')
    ) {
      throw new Error(
        'AUTH_RATE_LIMIT_HMAC_KEY must be a unique secret of at least 32 characters in production',
      );
    }
    return configured;
  }
  return configured || DEV_HMAC_KEY;
}

function digest(secret: string, domain: string, value: string): string {
  return createHmac('sha256', secret).update(`${domain}\0${value}`).digest('hex');
}
```

Derive:

```ts
ipId = digest(secret, 'ip', clientIp);
accountId = digest(secret, 'email', normalizedEmail);
pairId = digest(secret, 'pair', `${clientIp}\0${normalizedEmail}`);
```

Only return the digests through the port. Never return raw inputs or complete Redis keys.

- [ ] **Step 2: Implement Redis key builders**

Private helpers:

```ts
const pairKey = (id: string) => `auth:login:pair:${id}`;
const ipKey = (id: string) => `auth:login:ip:${id}`;
const accountEventsKey = (id: string) => `auth:login:account-observe:${id}:events`;
const accountSourcesKey = (id: string) => `auth:login:account-observe:${id}:sources`;
```

Every key gets a bounded TTL of at most `WINDOW_MS * 2` after mutation. Pre-checks must not refresh TTL merely because a blocked request arrived.

- [ ] **Step 3: Add an atomic pre-check Lua script for pair + IP buckets**

The script takes pair/IP keys plus window and thresholds. It MUST use Redis `TIME`, not Node wall-clock, so all API replicas share one time source.

Core script:

```lua
local t = redis.call('TIME')
local now = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)

local pairCount = redis.call('ZCARD', KEYS[1])
local ipCount = redis.call('ZCARD', KEYS[2])

if pairCount >= tonumber(ARGV[2]) then
  return {1, pairCount, ipCount}
end
if ipCount >= tonumber(ARGV[3]) then
  return {2, pairCount, ipCount}
end
return {0, pairCount, ipCount}
```

Map `1 -> 'pair'`, `2 -> 'ip'`, `0 -> null`.

- [ ] **Step 4: Add an atomic failure-record Lua script for pair + IP**

The bad credential attempt must update both blocking buckets in one EVAL:

```lua
local t = redis.call('TIME')
local now = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])
local member = tostring(now) .. ':' .. ARGV[2]

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
redis.call('ZADD', KEYS[1], now, member)
redis.call('ZADD', KEYS[2], now, member)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]))
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[3]))
return {redis.call('ZCARD', KEYS[1]), redis.call('ZCARD', KEYS[2])}
```

Pass `randomUUID()` as `ARGV[2]` and `WINDOW_MS * 2` as TTL.

This script records the fifth failure and still lets that request return normal invalid credentials; only the next pre-check blocks.

- [ ] **Step 5: Add account-observation mutation**

Use two HMAC-only ZSETs: one for failure events and one for each source's last-seen time. Run one Lua operation:

```lua
local t = redis.call('TIME')
local now = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])
local eventMember = tostring(now) .. ':' .. ARGV[2]
local sourceId = ARGV[3]

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
redis.call('ZADD', KEYS[1], now, eventMember)
redis.call('ZADD', KEYS[2], now, sourceId)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]))
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[4]))
return {redis.call('ZCARD', KEYS[1]), redis.call('ZCARD', KEYS[2])}
```

Return a distributed signal only when:

```ts
activeFailures >= ACCOUNT_OBSERVE_LIMIT &&
distinctSources >= ACCOUNT_DISTINCT_SOURCE_LIMIT
```

Never block based on this result.

- [ ] **Step 6: Implement `precheck()`**

```ts
async precheck(input: {
  normalizedEmail: string;
  clientIp: string;
}): Promise<LoginAbusePrecheckResult> {
  const identifiers = this.identifiers(input);
  const result = await this.redis.eval(
    PRECHECK_SCRIPT,
    2,
    pairKey(identifiers.pairId),
    ipKey(identifiers.ipId),
    WINDOW_MS,
    PAIR_FAILURE_LIMIT,
    IP_FAILURE_LIMIT,
  );
  const code = Number((result as unknown[])[0]);
  return {
    identifiers,
    limitedScope: code === 1 ? 'pair' : code === 2 ? 'ip' : null,
  };
}
```

Do not mutate or refresh blocked windows in `precheck()`.

- [ ] **Step 7: Implement `recordFailure()` and `clearPair()`**

`recordFailure()` first atomically records A+B, then separately records C because observation failure must never change authorization correctness. If the observation call alone fails, throw from the service; the use case's fail-open wrapper in Task 4 handles it while preserving the already-recorded A+B state.

`clearPair()` deletes only:

```ts
await this.redis.del(pairKey(identifiers.pairId));
```

It must not delete the IP or account-observation keys.

- [ ] **Step 8: Bind the provider**

In `identity-access.module.ts`:

```ts
import { LOGIN_ABUSE_PROTECTION } from '../../domain/ports/login-abuse-protection.port';
import { RedisLoginAbuseProtectionService } from '../services/redis-login-abuse-protection.service';

{ provide: LOGIN_ABUSE_PROTECTION, useClass: RedisLoginAbuseProtectionService },
```

Because `RedisModule` is global, do not add a duplicate Redis connection/provider to IdentityAccessModule.

- [ ] **Step 9: Run static verification**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

Expected: all exit 0. If TypeScript disagrees with ioredis `eval()` return typing, narrow the unknown result locally; do not cast the Redis client itself to `any`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/identity-access/domain/ports/login-abuse-protection.port.ts \
  apps/api/src/modules/identity-access/infrastructure/services/redis-login-abuse-protection.service.ts \
  apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts
git commit -m "feat(auth): add redis login abuse limiter"
```

---

### Task 4: Integrate source limiting into password login and retire persistent account lockout

**Files:**
- Modify: `apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts`
- Modify: `apps/api/src/modules/identity-access/domain/entities/user-account.entity.ts`
- Modify: `apps/api/src/modules/identity-access/infrastructure/http/public-auth.controller.ts`
- Modify: `apps/api/src/shared/http/throttle-limits.ts`

**Consumes:** `LOGIN_ABUSE_PROTECTION`, `AuthRateLimited`, and `parseTrustedClientIpHeader` from Tasks 2–3.

**Login meta remains:**

```ts
meta: { ip?: string; userAgent?: string }
```

but `meta.ip` now means the validated Caddy-derived trusted client IP for the login path.

- [ ] **Step 1: Remove `lockedUntil` from the password-login gate**

In `UserAccount.assertCanPasswordLogin()` change from lockout-first semantics to:

```ts
assertCanPasswordLogin(): string {
  if (this.state.status !== 'active') throw new AccountSuspended();
  if (this.state.passwordHash === null) throw new InvalidCredentials();
  return this.state.passwordHash;
}
```

If keeping the `now` argument would create a dead parameter, remove it and update the sole login caller. Leave `recordLoginFailure()` / `recordLoginSuccess()` and persisted fields in place for compatibility cleanup later; they must become unused by password login.

- [ ] **Step 2: Add limiter injection and privacy-safe Logger telemetry to `LoginUseCase`**

Add:

```ts
private readonly logger = new Logger(LoginUseCase.name);

constructor(
  @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
  @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  @Inject(LOGIN_ABUSE_PROTECTION)
  private readonly loginAbuse: ILoginAbuseProtection,
) {}
```

Use Nest `Logger` with structured object messages. Every telemetry object must use only HMAC identifiers and coarse dimensions.

- [ ] **Step 3: Add fail-open limiter helpers**

Use private methods with these semantics:

```ts
private async precheck(
  normalizedEmail: string,
  clientIp: string,
): Promise<LoginAbusePrecheckResult | null> {
  try {
    return await this.loginAbuse.precheck({ normalizedEmail, clientIp });
  } catch {
    this.logger.warn({ event: 'auth.login.limiter_unavailable', operation: 'precheck' });
    return null;
  }
}

private async recordFailure(
  normalizedEmail: string,
  clientIp: string,
): Promise<LoginAbuseFailureResult | null> {
  try {
    return await this.loginAbuse.recordFailure({ normalizedEmail, clientIp });
  } catch {
    this.logger.warn({ event: 'auth.login.limiter_unavailable', operation: 'record_failure' });
    return null;
  }
}

private async clearPair(normalizedEmail: string, clientIp: string): Promise<void> {
  try {
    await this.loginAbuse.clearPair({ normalizedEmail, clientIp });
  } catch {
    this.logger.warn({ event: 'auth.login.limiter_unavailable', operation: 'clear_pair' });
  }
}
```

Do not include exception message/stack if it could contain Redis keys. A generic operation field is sufficient for this security telemetry.

- [ ] **Step 4: Pre-check before user lookup / Argon2**

At the top of `execute()`:

```ts
const normalizedEmail = input.email;
let precheck: LoginAbusePrecheckResult | null = null;

if (meta.ip) {
  precheck = await this.precheck(normalizedEmail, meta.ip);
  if (precheck?.limitedScope) {
    this.logger.warn({
      event: 'auth.login.rate_limited',
      scope: precheck.limitedScope,
      sourceId: precheck.identifiers.ipId,
      accountId: precheck.identifiers.accountId,
    });
    throw new AuthRateLimited();
  }
} else {
  this.logger.warn({ event: 'auth.login.client_ip_unavailable' });
}
```

A blocked request must return before DB lookup and Argon2. Do not call `recordFailure()` for the blocked request; otherwise blocked traffic extends the window.

- [ ] **Step 5: Make unknown-email failures consume the same source budgets**

Replace:

```ts
if (!user) throw new InvalidCredentials();
```

with:

```ts
if (!user) {
  const failure = meta.ip ? await this.recordFailure(normalizedEmail, meta.ip) : null;
  this.logFailed(failure);
  throw new InvalidCredentials();
}
```

`logFailed()` should emit:

```ts
this.logger.warn({
  event: 'auth.login.failed',
  ...(failure
    ? {
        sourceId: failure.identifiers.ipId,
        accountId: failure.identifiers.accountId,
      }
    : {}),
});
```

If `failure?.distributedAttack` is present, emit a second event:

```ts
this.logger.warn({
  event: 'auth.login.distributed_attack_suspected',
  accountId: failure.identifiers.accountId,
  activeFailures: failure.distributedAttack.activeFailures,
  distinctSources: failure.distributedAttack.distinctSources,
});
```

Never log whether the account actually existed.

- [ ] **Step 6: Remove persistent lockout mutation on wrong password**

The credential portion becomes:

```ts
const passwordHash = user.assertCanPasswordLogin();
const valid = await this.hasher.verify(passwordHash, input.password);
if (!valid) {
  const failure = meta.ip ? await this.recordFailure(normalizedEmail, meta.ip) : null;
  this.logFailed(failure);
  throw new InvalidCredentials();
}
```

Delete from login use case:

```ts
user.recordLoginFailure(...)
users.updateLockout(...)
user.recordLoginSuccess()
```

Do not alter the repository port/schema in this task; dead lockout persistence is intentionally cleaned later.

- [ ] **Step 7: Clear only the pair bucket on correct password**

Before session creation:

```ts
if (meta.ip) await this.clearPair(normalizedEmail, meta.ip);
const userRecord = toUserRecord(user);
const tokens = await this.sessions.create(user.id, meta);
return { user: userRecord, tokens };
```

If clear fails, login still succeeds. Do not clear IP/account observation buckets.

- [ ] **Step 8: Feed the trusted header into login controller**

Import `Headers` and the Task 2 parser. Change only the login route from `@Ip()` to:

```ts
async login(
  @Body() input: LoginDto,
  @Res({ passthrough: true }) res: Response,
  @Req() req: Request,
  @Headers(BOOKINGOS_CLIENT_IP_HEADER) clientIpHeader: string | string[] | undefined,
): Promise<AuthSessionResponse> {
  const ip = parseTrustedClientIpHeader(clientIpHeader);
  const { user, tokens } = await this.loginUseCase.execute(input, {
    ip,
    userAgent: req.headers['user-agent'],
  });
  setSessionCookies(res, tokens);
  return toResponse(user, tokens);
}
```

Leave `@Ip()` unchanged on registration/upgrade flows; AUTH-001 is intentionally login-specific.

- [ ] **Step 9: Correct the throttle-limits documentation**

Replace the stale sentence that credential guessing belongs on account lockout with an explicit note:

```text
POST /auth/login has a dedicated trusted-client-IP Redis limiter. Nest Throttler remains only a site-wide capacity ceiling because SSR/BFF calls share container source addresses.
```

Do not lower `THROTTLE_AUTH_ATTEMPT` as part of this fix.

- [ ] **Step 10: Verify the API slice**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
```

Also search active login code:

```bash
rg "recordLoginFailure|recordLoginSuccess|updateLockout|ACCOUNT_LOCKED" \
  apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts \
  apps/api/src/modules/identity-access/infrastructure/http/public-auth.controller.ts
```

Expected: no active login references.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts \
  apps/api/src/modules/identity-access/domain/entities/user-account.entity.ts \
  apps/api/src/modules/identity-access/infrastructure/http/public-auth.controller.ts \
  apps/api/src/shared/http/throttle-limits.ts
git commit -m "fix(auth): replace account lockout with source limits"
```

---

### Task 5: Replace account-lockout UI with rate-limit messaging

**Files:**
- Modify: `packages/i18n/src/locales/vi/auth.ts`
- Modify: `packages/i18n/src/locales/en/auth.ts`
- Modify: `apps/storefront/app/features/auth/components/auth-form-controls.tsx`
- Modify: `apps/dashboard/app/routes/auth/login.tsx`

**Produces:** user-visible `AUTH_RATE_LIMITED` handling on both storefront and dashboard.

- [ ] **Step 1: Rename the storefront i18n key**

Vietnamese:

```ts
errors: {
  // ...existing entries
  rateLimited: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.',
}
```

English:

```ts
errors: {
  // ...existing entries
  rateLimited: 'Too many login attempts. Please try again later.',
}
```

Remove `accountLocked` from both locale objects. Keep translation shapes identical.

- [ ] **Step 2: Map storefront API code**

In `messageFor()`:

```ts
if (error === 'AUTH_RATE_LIMITED') return t('errors.rateLimited');
```

Remove:

```ts
if (error === 'ACCOUNT_LOCKED') return t('errors.accountLocked');
```

Do not map `AUTH_RATE_LIMITED` to invalid credentials; users need actionable retry guidance.

- [ ] **Step 3: Update dashboard login error handling**

Use:

```ts
const message =
  result.code === 'AUTH_RATE_LIMITED'
    ? 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.'
    : result.status === 503
      ? 'Không kết nối được máy chủ. Vui lòng thử lại.'
      : 'Email hoặc mật khẩu không đúng.';
```

Delete the `ACCOUNT_LOCKED` branch and its wording that the account itself is locked.

- [ ] **Step 4: Search for stale active UI semantics**

```bash
rg "ACCOUNT_LOCKED|accountLocked|Tài khoản tạm.*khóa|temporarily locked" \
  apps/storefront apps/dashboard packages/i18n
```

Expected: no active frontend/i18n matches. Historical specs/docs may still mention legacy behavior and do not need rewriting unless they claim to describe current behavior.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter=@booking/i18n typecheck
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
```

Then:

```bash
git add packages/i18n/src/locales/vi/auth.ts \
  packages/i18n/src/locales/en/auth.ts \
  apps/storefront/app/features/auth/components/auth-form-controls.tsx \
  apps/dashboard/app/routes/auth/login.tsx
git commit -m "fix(auth): show source rate-limit messaging"
```

---

### Task 6: Add disposable runtime smoke for the 16 AUTH-001 acceptance cases

**Files:**
- Create TEMPORARILY: `.github/workflows/auth-001-runtime-smoke.yml`
- No permanent automated test files.

**Purpose:** obtain production-shaped evidence with real PostgreSQL, Redis, API processes, both SSR/BFFs, and Caddy behavior, then delete the workflow before final source-only CI.

- [ ] **Step 1: Create the temporary workflow skeleton**

Use `workflow_dispatch` and `pull_request` while the implementation PR is open. Services:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: booking
    ports: ['5432:5432']
    options: >-
      --health-cmd "pg_isready -U postgres -d booking"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 20
  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 20
```

Set a non-production smoke secret:

```yaml
AUTH_RATE_LIMIT_HMAC_KEY: auth001-runtime-smoke-secret-0123456789abcdef
```

Use repository-standard Prisma migration/role setup commands before starting API.

- [ ] **Step 2: Start the API and create two real password accounts**

Start API on `127.0.0.1:3000` with Redis/Postgres. Create accounts through existing `POST /auth/register`, not direct SQL, so password hashing and account defaults are real.

Example account fixtures:

```text
victim-a@example.test / Auth001-pass-1
victim-b@example.test / Auth001-pass-2
```

Persist cookie jars only for setup if needed; clear them before login tests.

- [ ] **Step 3: Prove pair limit and cross-IP non-lockout**

Direct API requests explicitly set the canonical trusted header for disposable smoke.

For IP `203.0.113.10`, send five wrong passwords for victim A. Assert all five return `401 INVALID_CREDENTIALS`. Sixth request from the same IP/email returns:

```json
{
  "statusCode": 429,
  "code": "AUTH_RATE_LIMITED",
  "message": "Too many login attempts. Please try again later."
}
```

Then immediately submit the correct password with `X-BookingOS-Client-IP: 203.0.113.11`; assert 200 + session cookies. This is the primary AUTH-001 regression proof.

- [ ] **Step 4: Prove IP-wide spray limit**

From `198.51.100.20`, generate 30 failed logins across syntactically valid but distinct emails. The 31st request from that IP must return 429 regardless of email.

A request from `198.51.100.21` must still reach normal credential evaluation.

- [ ] **Step 5: Prove pair clear semantics**

Use a fresh source/account pair:

1. record two wrong passwords;
2. correct password from the same trusted IP succeeds;
3. four new wrong passwords remain `401`;
4. the fifth new wrong password remains `401`;
5. the following request is `429`.

This proves success cleared the pair history.

Separately, accumulate IP-wide failures across accounts, perform one successful login, then continue failures until the original IP-wide total reaches 30; next request must be 429. This proves success did not clear Bucket B.

- [ ] **Step 6: Prove unknown-email and wrong-password external parity**

Capture status/code/message for:

```text
unknown@example.test + wrong password
victim-a@example.test + wrong password
```

Both must be exactly `401 / INVALID_CREDENTIALS / Invalid email or password`. Do not assert timing equality; timing-side-channel equalization is outside the approved spec.

- [ ] **Step 7: Prove missing/malformed trusted IP fails open without a shared bucket**

Send repeated wrong logins with:

```text
no X-BookingOS-Client-IP
X-BookingOS-Client-IP: 1.2.3.4, 5.6.7.8
X-BookingOS-Client-IP: not-an-ip
```

Assert they continue through credential verification rather than using a BFF/container source bucket. Capture logs and assert `auth.login.client_ip_unavailable` appears without raw submitted header values.

- [ ] **Step 8: Prove Redis limiter outage fail-open**

Use a fresh valid account/source before any limiting state. Stop Redis, then submit the correct password. The limiter precheck must fail open; if session storage also depends on Redis and therefore prevents a final 200, instrument the smoke at the LoginUseCase boundary by running the API command/path that demonstrates Argon2 credential verification is reached before the expected session-store failure. The workflow must distinguish:

```text
PASS: limiter did not reject the correct password
EXPECTED INFRA FAILURE: session creation cannot complete while Redis is down
```

Restart Redis and confirm `auth.login.limiter_unavailable` was emitted with no raw Redis key/email/IP.

Do not weaken session-store behavior just to make this smoke return HTTP 200.

- [ ] **Step 9: Prove distributed account observation does not block**

For victim B, create 20 bad attempts across at least three distinct trusted IPs while keeping each pair below 5 and each IP below 30. Assert logs contain:

```text
auth.login.distributed_attack_suspected
activeFailures >= 20
distinctSources >= 3
```

Then correct-password login from a fourth trusted IP must succeed.

- [ ] **Step 10: Prove old PostgreSQL lockout state is inert**

Using the disposable DB only, set victim B's legacy columns:

```sql
UPDATE users
SET failed_login_count = 4,
    locked_until = now() + interval '1 hour'
WHERE email = 'victim-b@example.test';
```

Correct-password login from a fresh trusted IP must still succeed. After one failed login, query the same row and assert `failed_login_count` / `locked_until` are unchanged by the new login flow.

- [ ] **Step 11: Prove BFF forwarding helpers and Caddy overwrite**

For storefront/dashboard BFFs, start the production builds or dev SSR servers in the workflow and submit login requests with an incoming canonical header. Capture API-side request metadata only in the temporary smoke environment or use a temporary debug endpoint/process wrapper that is never committed to product code. Assert both BFFs forward one valid literal and omit malformed values.

For Caddy, use the actual `docker/caddy/Caddyfile` and production-shaped host routing with local-only hostnames, or `caddy adapt` plus a disposable upstream echo server, to prove an incoming fake header such as:

```text
X-BookingOS-Client-IP: 8.8.8.8
```

is replaced by Caddy's actual remote peer before the request reaches the upstream. The workflow must fail if the fake value survives.

Do not add a permanent debug endpoint to the API.

- [ ] **Step 12: Assert frontend 429 copy**

Storefront `/vi/auth/login` and dashboard `/auth/login` should surface the Vietnamese rate-limit message after backend `AUTH_RATE_LIMITED`. The smoke may assert response/action payload HTML/text; no Playwright or browser test runner.

- [ ] **Step 13: Run the temporary workflow and fix only product/harness root causes**

Expected acceptance list:

```text
1  pair five failures then block
2  correct password from different IP succeeds
3  IP spray reaches 30 then blocks
4  success clears only exact pair
5  success preserves IP-wide history
6  unknown/wrong response parity
7  Caddy overwrites spoofed header
8  storefront forwards trusted header
9  dashboard forwards trusted header
10 direct api.* receives Caddy-injected trusted header
11 missing/malformed trusted IP skips source limiter + telemetry
12 limiter Redis outage does not become credential rejection
13 distributed observation emits but does not block
14 legacy lockedUntil is inert
15 failed login does not mutate legacy lockout columns
16 frontend shows rate-limit copy, not account-lock copy
```

If a smoke failure is harness-only, fix the harness and rerun. If product behavior fails, use systematic-debugging before changing product code.

- [ ] **Step 14: Commit the temporary workflow only while collecting evidence**

```bash
git add .github/workflows/auth-001-runtime-smoke.yml
git commit -m "ci(auth): add temporary AUTH-001 runtime smoke"
```

Record exact successful run ID/head SHA in the PR body later.

---

### Task 7: Remove temporary verification artifacts and run final source-only gates

**Files:**
- Delete: `.github/workflows/auth-001-runtime-smoke.yml`
- Review active docs/comments for stale account-lockout claims.

- [ ] **Step 1: Delete the temporary runtime workflow**

After a successful runtime run has been recorded:

```bash
git rm .github/workflows/auth-001-runtime-smoke.yml
git commit -m "chore(ci): remove AUTH-001 runtime smoke"
```

No permanent test workflow/debug endpoint may remain.

- [ ] **Step 2: Search for stale active lockout semantics**

Run:

```bash
rg "ACCOUNT_LOCKED|MAX_FAILED_LOGIN_ATTEMPTS|LOGIN_LOCKOUT_MINUTES|recordLoginFailure|recordLoginSuccess|updateLockout|failed login.*lock|account.*locked" \
  apps packages docs docker .env.example .env.deploy.example
```

Classify matches:

```text
KEEP: legacy schema/entity/repository compatibility declarations and historical design/plan text.
CHANGE: active login code, UI copy, current deployment docs, current throttle comments.
```

Do not remove legacy DB fields/port methods in this PR solely to make `rg` empty.

- [ ] **Step 3: Run repository static gates**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm check:frontend-structure
pnpm check:theme-tokens
pnpm check:tenant-surfaces
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
```

Then run the repository-level required gate:

```bash
pnpm turbo lint typecheck build
pnpm --filter=@booking/api check:rls
```

Expected: all exit 0 on the final source-only head.

- [ ] **Step 4: Revalidate Caddy on final source-only head**

```bash
docker run --rm \
  -e ACME_EMAIL=ops@example.invalid \
  -e DASHBOARD_HOST=admin.example.invalid \
  -e API_HOST=api.example.invalid \
  -e PLATFORM_BASE_DOMAIN=example.invalid \
  -v "$PWD/docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Expected: exit 0.

- [ ] **Step 5: Verify production secret guard separately from Redis runtime fail-open**

Run an API boot/build smoke with:

```text
NODE_ENV=production
AUTH_RATE_LIMIT_HMAC_KEY missing -> boot/provider construction fails
AUTH_RATE_LIMIT_HMAC_KEY=CHANGE_ME -> fails
AUTH_RATE_LIMIT_HMAC_KEY shorter than 32 chars -> fails
valid 64-hex secret -> limiter provider constructs
```

Then with a valid secret and Redis unavailable, verify the process behavior matches the existing Redis dependency model and AUTH-001 limiter calls themselves remain fail-open as demonstrated in Task 6. Do not conflate configuration-integrity failure with runtime limiter failure.

- [ ] **Step 6: Commit any final stale-doc cleanup if needed**

Only if Step 2 found active stale semantics:

```bash
git add <only files corrected for AUTH-001 semantics>
git commit -m "docs(auth): document source-scoped login limits"
```

---

### Task 8: Final review, PR, and integration gate

**Files:** no new product files expected.

- [ ] **Step 1: Compare implementation against the spec requirement-by-requirement**

Reviewer checklist:

```text
[ ] Caddy overwrites canonical header at every public app/API reverse proxy.
[ ] BFF parsers accept one IP literal only and omit malformed/missing values.
[ ] API never falls back to req.ip for source limiting.
[ ] Pair 5/10m and IP 30/10m use Redis sliding windows.
[ ] Pair/IP failure mutation is atomic.
[ ] Account observation is 20/10m + >=3 distinct hashed sources and never blocks.
[ ] HMAC identifiers are domain-separated; no raw email/IP in Redis keys/logs.
[ ] Production HMAC secret fails fast when missing/unsafe.
[ ] Limiter runtime errors fail open for credential verification.
[ ] Unknown email and wrong password remain same public 401 envelope.
[ ] Correct password clears only pair history.
[ ] Password login no longer reads/writes persistent lockout state.
[ ] Existing legacy lockout DB values cannot stop correct-password login.
[ ] Storefront/dashboard show AUTH_RATE_LIMITED copy and no active ACCOUNT_LOCKED copy.
[ ] No Prisma migration.
[ ] Temporary runtime workflow removed.
[ ] Final source-only static/Caddy gates green.
```

- [ ] **Step 2: Review the diff for accidental scope expansion**

Expected intentional surfaces only:

```text
docker/caddy
apps/storefront auth server helpers/copy
apps/dashboard auth server helper/copy
apps/api identity-access login limiter/error/controller/entity/module
apps/api throttle comment
packages/i18n auth copy
.env examples
docker-compose.deploy.yml
docs/deployment.md
docs/superpowers spec/plan
```

Reject unrelated refactors, schema migrations, global proxy changes, CAPTCHA/MFA work, or generic throttler rewrites.

- [ ] **Step 3: Open a Draft PR after implementation authorization permits push/PR creation**

Suggested branch/title:

```text
fix/auth-001-login-abuse-protection
fix(auth): prevent targeted login lockout DoS
```

PR body must include:

```text
- security invariant and root cause
- pair/IP/account-observation thresholds
- Caddy/BFF/API trust boundary
- no DB migration / legacy columns inert
- final source-only CI head + run IDs
- disposable runtime smoke run ID and 16 acceptance-case result
- explicit note: no deploy in this PR workflow
```

Create Draft by default. Do not mark Ready, merge, or deploy without separate authorization.

- [ ] **Step 4: Run final review workflow**

Use `superpowers:requesting-code-review`. If no independent subagent is available, perform a static review against the checklist above and state that limitation explicitly. Address review findings using `superpowers:receiving-code-review` before claiming merge readiness.

- [ ] **Step 5: Finish only with fresh verification evidence**

Immediately before claiming AUTH-001 implementation complete, use `superpowers:verification-before-completion` and re-fetch/check the exact branch head and CI status. The final report must distinguish:

```text
code fixed + source-only CI green
runtime smoke green
PR review state
merged or not merged
deployed or not deployed
```

Never call AUTH-001 production-remediated until the changed Caddy/BFF/API stack is actually deployed and trusted-client-IP telemetry confirms real source diversity in that environment.
