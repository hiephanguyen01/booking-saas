# Login Abuse Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace persistent account-wide password lockout with trusted-client-IP, Redis-backed source-scoped login abuse protection so an attacker cannot remotely lock a victim account while BookingOS still resists repeated guessing and credential spraying.

**Architecture:** Caddy is the public trust boundary and overwrites an application-specific client-IP header. Storefront/dashboard BFF login calls validate and forward only that trusted IP. The API applies a dedicated fail-fast Redis connection for pair/IP sliding-window limits plus account-observation telemetry, while password login no longer reads or writes persistent lockout state. Limiter command failures fail open; production secret misconfiguration fails fast at provider construction.

**Tech Stack:** Caddy 2, React Router 8 SSR, NestJS 11, ioredis 5, Redis Lua/EVAL, Argon2, Zod, Prisma 6/PostgreSQL, nestjs-pino, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-08-21-login-abuse-protection-design.md`

## Global Constraints

- Security invariant: an unauthenticated source must not be able to create persistent account state that prevents a victim with the correct password from logging in from an unrelated trusted client IP.
- Bucket A: exactly 5 failed attempts / 10 minutes for trusted client IP + normalized email; the fifth failure is still `401`, the next request is `429`.
- Bucket B: exactly 30 failed attempts / 10 minutes for trusted client IP; successful login never clears it.
- Bucket C: observe 20 failed attempts / 10 minutes and at least 3 distinct hashed client IPs; telemetry only, never an authorization gate.
- Only failed password-login attempts consume budgets. Successful login clears only the exact pair bucket.
- Unknown email and wrong password remain externally identical: `401 INVALID_CREDENTIALS` / `Invalid email or password`.
- Source limit response: `429 AUTH_RATE_LIMITED` / generic retry message; never reveal which bucket, exact counts, email existence, raw IP/email, or Redis keys/digests.
- Caddy must overwrite `X-BookingOS-Client-IP`; browser-supplied values must not survive the public edge unchanged.
- Do not enable global Express/Nest `trust proxy` in AUTH-001.
- BFF/API parsers accept one IPv4 or IPv6 literal only. Missing, comma-separated, array-valued, or malformed input becomes unavailable; never fall back to `X-Forwarded-For`, `CF-Connecting-IP`, or `req.ip`.
- Missing trusted IP skips source limiting and emits `auth.login.client_ip_unavailable`.
- Redis limiter operation failure emits `auth.login.limiter_unavailable` and must not reject otherwise-correct credentials.
- The limiter MUST NOT reuse the global Redis connection's indefinite command behavior. The dedicated limiter connection uses `maxRetriesPerRequest: 1`, `enableOfflineQueue: false`, and a finite `commandTimeout` so fail-open code actually receives an error rather than hanging.
- `AUTH_RATE_LIMIT_HMAC_KEY` is API-only, required/strong in production, identical across API replicas, and not reused from session/payment secrets.
- Redis keys and telemetry identifiers use domain-separated HMAC-SHA-256; never raw email/IP.
- Passwords, auth headers, session tokens, HMAC secret material, raw email/IP, and full Redis keys must not be logged.
- Password login no longer reads/writes `failed_login_count` or `locked_until`; columns, repository method, entity methods/constants, and `AccountLocked` may remain compatibility-dead until a later cleanup migration.
- No Prisma migration in AUTH-001.
- ADR 0005 (`docs/decisions/0005-no-tests-policy.md`) forbids automated test files/runners. Do not add Jest/Vitest/Playwright or `*.test.*` / `*.spec.*`. Use static gates and a temporary disposable runtime workflow; delete that workflow before final source-only CI.
- No merge, deploy, or production rollout without separate authorization.
- At execution time use isolated branch `fix/auth-001-login-abuse-protection` from this approved design/plan head. If `main` moved, compare/rebase before product-code commits.

## File Map

**Edge / BFF trust boundary**
- Modify `docker/caddy/Caddyfile` — overwrite canonical client-IP header at all public app/API reverse proxies.
- Create `apps/storefront/app/lib/server/trusted-client-ip.server.ts` — single-IP validation.
- Modify `apps/storefront/app/lib/server/api-request.server.ts` — login-only request options with trusted IP.
- Modify `apps/storefront/app/lib/server/api.server.ts` — use login-only options.
- Create `apps/dashboard/app/lib/trusted-client-ip.server.ts` — same semantics for dashboard.
- Modify `apps/dashboard/app/lib/api.server.ts` — request-aware `backendLogin()`.
- Modify `apps/dashboard/app/routes/auth/login.tsx` — pass current `Request`.

**API limiter / login**
- Create `apps/api/src/modules/identity-access/infrastructure/http/trusted-client-ip.ts`.
- Create `apps/api/src/modules/identity-access/domain/ports/login-abuse-protection.port.ts`.
- Create `apps/api/src/modules/identity-access/infrastructure/services/redis-login-abuse-protection.service.ts`.
- Modify `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts`.
- Modify `apps/api/src/modules/identity-access/domain/errors/identity-access-errors.ts`.
- Modify `apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts`.
- Modify `apps/api/src/modules/identity-access/domain/entities/user-account.entity.ts`.
- Modify `apps/api/src/modules/identity-access/infrastructure/http/public-auth.controller.ts`.
- Modify `apps/api/src/shared/http/throttle-limits.ts`.

**Copy / config / docs**
- Modify `packages/i18n/src/locales/vi/auth.ts`, `packages/i18n/src/locales/en/auth.ts`.
- Modify `apps/storefront/app/features/auth/components/auth-form-controls.tsx`.
- Modify `apps/dashboard/app/routes/auth/login.tsx`.
- Modify `.env.example`, `.env.deploy.example`, `docker-compose.deploy.yml`, `docs/deployment.md`.

**Temporary verification only**
- Create then delete `.github/workflows/auth-001-runtime-smoke.yml`.

---

### Task 1: Propagate one trusted client IP from Caddy through both BFFs

**Files:** Caddyfile + storefront/dashboard server helpers and login callers listed above.

**Produces:**

```ts
export const BOOKINGOS_CLIENT_IP_HEADER = 'x-bookingos-client-ip';
export function trustedClientIpFromRequest(request: Request): string | undefined;
export function trustedClientIpHeaders(request: Request): Record<string, string>;
```

- [ ] **Step 1: Create storefront trusted-IP helper**

```ts
import { isIP } from 'node:net';

export const BOOKINGOS_CLIENT_IP_HEADER = 'x-bookingos-client-ip';

export function trustedClientIpFromRequest(request: Request): string | undefined {
  const raw = request.headers.get(BOOKINGOS_CLIENT_IP_HEADER)?.trim();
  if (!raw || raw.includes(',') || isIP(raw) === 0) return undefined;
  return raw;
}

export function trustedClientIpHeaders(request: Request): Record<string, string> {
  const value = trustedClientIpFromRequest(request);
  return value ? { [BOOKINGOS_CLIENT_IP_HEADER]: value } : {};
}
```

No fallback header/source.

- [ ] **Step 2: Add storefront login-only auth options**

In `api-request.server.ts`:

```ts
import type { ApiRequestOptions, AuthRequestOptions } from '@booking/api-client';
import { trustedClientIpHeaders } from './trusted-client-ip.server';

export function storefrontLoginOptions(request: Request): AuthRequestOptions {
  const base = storefrontAuthOptions(request);
  return {
    ...base,
    headers: { ...base.headers, ...trustedClientIpHeaders(request) },
  };
}
```

Leave register/refresh/logout on existing `storefrontAuthOptions()`.

- [ ] **Step 3: Wire storefront `backendLogin()`**

```ts
export const backendLogin = (request: Request, credentials: { email: string; password: string }) =>
  apiClient.login(credentials, storefrontLoginOptions(request));
```

- [ ] **Step 4: Create dashboard trusted-IP helper with exactly the same validation semantics**

Use a separate tiny server-only file; do not create a new shared package just for this helper.

- [ ] **Step 5: Make dashboard `backendLogin()` request-aware**

```ts
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

Change dashboard login action to `backendLogin(request, parsed.data)`.

- [ ] **Step 6: Overwrite at every public Caddy reverse proxy**

Convert each public proxy to a block when needed:

```caddyfile
reverse_proxy api:3000 {
	header_up X-BookingOS-Client-IP {remote_host}
}
```

Apply the same line to all public `dashboard:3000` and `storefront:3000` proxies, covering explicit dashboard/API/platform storefront plus catch-all dashboard/storefront. Do not add it to on-demand TLS `ask`.

- [ ] **Step 7: Verify**

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

- [ ] **Step 8: Commit**

```bash
git add docker/caddy/Caddyfile apps/storefront/app/lib/server \
  apps/dashboard/app/lib/trusted-client-ip.server.ts \
  apps/dashboard/app/lib/api.server.ts apps/dashboard/app/routes/auth/login.tsx
git commit -m "fix(auth): propagate trusted login client ip"
```

---

### Task 2: Define API contracts, 429 error, and production secret configuration

**Files:** API trusted-IP helper, limiter port, error, env/deploy/docs files.

**Produces:**

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
  observationUnavailable: boolean;
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

- [ ] **Step 1: Create API trusted-header parser**

```ts
import { isIP } from 'node:net';
export const BOOKINGOS_CLIENT_IP_HEADER = 'x-bookingos-client-ip';
export function parseTrustedClientIpHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) return undefined;
  const normalized = value?.trim();
  if (!normalized || normalized.includes(',') || isIP(normalized) === 0) return undefined;
  return normalized;
}
```

- [ ] **Step 2: Add limiter port exactly as above**

No Redis/Nest/Logger imports in the port.

- [ ] **Step 3: Add error**

```ts
export class AuthRateLimited extends DomainError {
  constructor() {
    super('AUTH_RATE_LIMITED', 429, 'Too many login attempts. Please try again later.');
  }
}
```

Keep `AccountLocked` defined but unused by login.

- [ ] **Step 4: Add HMAC secret to local/deploy configuration**

`.env.example`:

```dotenv
AUTH_RATE_LIMIT_HMAC_KEY=dev-auth-rate-limit-hmac-key-not-for-production
```

`.env.deploy.example`:

```dotenv
# Generate: openssl rand -hex 32
AUTH_RATE_LIMIT_HMAC_KEY=CHANGE_ME_generate_with_openssl_rand_hex_32
```

`docker-compose.deploy.yml`, API only:

```yaml
AUTH_RATE_LIMIT_HMAC_KEY: ${AUTH_RATE_LIMIT_HMAC_KEY:?AUTH_RATE_LIMIT_HMAC_KEY is required}
```

- [ ] **Step 5: Update deployment docs**

Document generation, same-value-across-replicas requirement, rotation effect (only current abuse history becomes unreachable), and Caddy trust-boundary warning if a CDN/LB is ever inserted before Caddy.

- [ ] **Step 6: Verify + commit**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck

git add apps/api/src/modules/identity-access/infrastructure/http/trusted-client-ip.ts \
  apps/api/src/modules/identity-access/domain/ports/login-abuse-protection.port.ts \
  apps/api/src/modules/identity-access/domain/errors/identity-access-errors.ts \
  .env.example .env.deploy.example docker-compose.deploy.yml docs/deployment.md
git commit -m "feat(auth): define login abuse protection boundary"
```

---

### Task 3: Implement a genuinely fail-fast Redis sliding-window limiter

**Files:** create `redis-login-abuse-protection.service.ts`; modify IdentityAccessModule.

**Consumes:** global `REDIS` only as connection-template/source configuration. **Do not send limiter commands through the global Redis instance**, because it currently uses `maxRetriesPerRequest: null` and may wait indefinitely during disconnects.

**Constants:**

```ts
const WINDOW_MS = 10 * 60 * 1_000;
const KEY_TTL_MS = WINDOW_MS * 2;
const PAIR_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 30;
const ACCOUNT_OBSERVE_LIMIT = 20;
const ACCOUNT_DISTINCT_SOURCE_LIMIT = 3;
const COMMAND_TIMEOUT_MS = 750;
const DEV_HMAC_KEY = 'dev-auth-rate-limit-hmac-key-not-for-production';
```

- [ ] **Step 1: Create a dedicated limiter Redis connection with finite command failure**

```ts
@Injectable()
export class RedisLoginAbuseProtectionService implements OnApplicationShutdown {
  private readonly redis: Redis;
  private readonly secret: string;

  constructor(@Inject(REDIS) sharedRedis: Redis) {
    this.secret = loadHmacKey();
    this.redis = sharedRedis.duplicate({
      connectionName: 'auth-login-abuse',
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      commandTimeout: COMMAND_TIMEOUT_MS,
    });
    this.redis.on('error', () => undefined);
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
```

Rationale: ioredis documents that `maxRetriesPerRequest: null` waits indefinitely, `enableOfflineQueue: false` rejects commands while not ready, and `commandTimeout` rejects commands that do not receive a reply in time. `duplicate(overrides)` merges the original connection config with these limiter-specific options.

Do not use `quit()` in shutdown for this dedicated client; `disconnect()` must not wait on an unavailable Redis server.

- [ ] **Step 2: Validate production HMAC key and derive identifiers**

```ts
function loadHmacKey(): string {
  const key = process.env.AUTH_RATE_LIMIT_HMAC_KEY?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!key || key.length < 32 || key === DEV_HMAC_KEY || key.startsWith('CHANGE_ME')) {
      throw new Error(
        'AUTH_RATE_LIMIT_HMAC_KEY must be a unique secret of at least 32 characters in production',
      );
    }
    return key;
  }
  return key || DEV_HMAC_KEY;
}

function hmac(secret: string, domain: string, value: string): string {
  return createHmac('sha256', secret).update(`${domain}\0${value}`).digest('hex');
}
```

IDs:

```ts
ipId = hmac(secret, 'ip', clientIp);
accountId = hmac(secret, 'email', normalizedEmail);
pairId = hmac(secret, 'pair', `${clientIp}\0${normalizedEmail}`);
```

- [ ] **Step 3: Use privacy-safe Redis keys**

```ts
pair: `auth:login:pair:${pairId}`
ip: `auth:login:ip:${ipId}`
account events: `auth:login:account-observe:${accountId}:events`
account sources: `auth:login:account-observe:${accountId}:sources`
```

- [ ] **Step 4: Implement atomic precheck Lua using Redis TIME**

```lua
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
local pairCount = redis.call('ZCARD', KEYS[1])
local ipCount = redis.call('ZCARD', KEYS[2])
if pairCount >= tonumber(ARGV[2]) then return {1, pairCount, ipCount} end
if ipCount >= tonumber(ARGV[3]) then return {2, pairCount, ipCount} end
return {0, pairCount, ipCount}
```

Precheck never refreshes TTL and never records blocked traffic.

- [ ] **Step 5: Implement atomic pair+IP failure recording Lua**

```lua
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
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

Use `randomUUID()` for nonce. One bad attempt cannot update only one blocking bucket.

- [ ] **Step 6: Implement observation Lua separately**

Maintain failure events and distinct source last-seen ZSETs; prune both to 10 minutes, add event+source, set bounded TTL, return event/source counts. `distributedAttack` is non-null only when failures >=20 AND distinct sources >=3.

Observation is not authorization state. If this separate call fails after pair/IP recording succeeded, catch it inside the service and return:

```ts
{
  identifiers,
  distributedAttack: null,
  observationUnavailable: true,
}
```

Do not throw away the successful pair/IP result because telemetry storage failed.

- [ ] **Step 7: Implement port methods**

`precheck()` maps Lua code `1 -> pair`, `2 -> ip`, `0 -> null`.

`recordFailure()` runs atomic A+B first, then observation as Step 6.

`clearPair()` performs only:

```ts
await this.redis.del(pairKey(identifiers.pairId));
```

Never clear IP/account-observation keys.

- [ ] **Step 8: Bind provider**

```ts
{ provide: LOGIN_ABUSE_PROTECTION, useClass: RedisLoginAbuseProtectionService }
```

Do not register another global Redis provider.

- [ ] **Step 9: Static verification + commit**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build

git add apps/api/src/modules/identity-access/domain/ports/login-abuse-protection.port.ts \
  apps/api/src/modules/identity-access/infrastructure/services/redis-login-abuse-protection.service.ts \
  apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts
git commit -m "feat(auth): add fail-fast redis login limiter"
```

---

### Task 4: Integrate limiter into login and remove persistent lockout behavior

**Files:** login use case, UserAccount entity, public auth controller, throttle comment.

- [ ] **Step 1: Make password-login domain gate ignore legacy lockout**

```ts
assertCanPasswordLogin(): string {
  if (this.state.status !== 'active') throw new AccountSuspended();
  if (this.state.passwordHash === null) throw new InvalidCredentials();
  return this.state.passwordHash;
}
```

Remove unused `now` parameter from the sole login caller. Leave legacy lockout methods/constants/fields for later cleanup.

- [ ] **Step 2: Inject limiter and structured Logger**

```ts
private readonly logger = new Logger(LoginUseCase.name);

@Inject(LOGIN_ABUSE_PROTECTION)
private readonly loginAbuse: ILoginAbuseProtection
```

- [ ] **Step 3: Add fail-open wrappers**

`precheck`, `recordFailure`, and `clearPair` each `try` limiter operation and on throw emit only:

```ts
{ event: 'auth.login.limiter_unavailable', operation: 'precheck' | 'record_failure' | 'clear_pair' }
```

No error message/stack containing Redis keys.

When `recordFailure()` returns `observationUnavailable: true`, additionally emit:

```ts
{ event: 'auth.login.limiter_unavailable', operation: 'account_observation' }
```

without discarding returned safe identifiers.

- [ ] **Step 4: Precheck before DB lookup/Argon2**

```ts
if (meta.ip) {
  const result = await this.safePrecheck(input.email, meta.ip);
  if (result?.limitedScope) {
    this.logger.warn({
      event: 'auth.login.rate_limited',
      scope: result.limitedScope,
      sourceId: result.identifiers.ipId,
      accountId: result.identifiers.accountId,
    });
    throw new AuthRateLimited();
  }
} else {
  this.logger.warn({ event: 'auth.login.client_ip_unavailable' });
}
```

Blocked requests never record new failures or extend the window.

- [ ] **Step 5: Make unknown email consume the same source budgets**

For no user, call safe `recordFailure()` when `meta.ip` exists, emit `auth.login.failed` using only returned HMAC IDs, optionally distributed-attack telemetry, then throw `InvalidCredentials`.

Do not reveal whether a real user existed in logs exposed to normal operators; use the same `auth.login.failed` event shape for unknown email and wrong password.

- [ ] **Step 6: Remove DB lockout writes on wrong/correct password**

Core flow:

```ts
const passwordHash = user.assertCanPasswordLogin();
const valid = await this.hasher.verify(passwordHash, input.password);
if (!valid) {
  const failure = meta.ip ? await this.safeRecordFailure(input.email, meta.ip) : null;
  this.logFailed(failure);
  throw new InvalidCredentials();
}

if (meta.ip) await this.safeClearPair(input.email, meta.ip);
const userRecord = toUserRecord(user);
const tokens = await this.sessions.create(user.id, meta);
return { user: userRecord, tokens };
```

Delete login-use-case calls to `recordLoginFailure`, `recordLoginSuccess`, and `users.updateLockout`.

- [ ] **Step 7: Emit account-observation telemetry**

When returned signal exists:

```ts
this.logger.warn({
  event: 'auth.login.distributed_attack_suspected',
  accountId: failure.identifiers.accountId,
  activeFailures: failure.distributedAttack.activeFailures,
  distinctSources: failure.distributedAttack.distinctSources,
});
```

Never block from this signal.

- [ ] **Step 8: Use canonical header only on login controller**

Change login route from `@Ip()` to `@Headers(BOOKINGOS_CLIENT_IP_HEADER)`, parse with `parseTrustedClientIpHeader`, and pass parsed value as `meta.ip`. Leave registration/upgrade routes unchanged.

- [ ] **Step 9: Correct throttle documentation**

Keep `THROTTLE_AUTH_ATTEMPT` numeric value unchanged. Update comment to say Nest throttler is a site-wide capacity ceiling; `/auth/login` now has dedicated trusted-client-IP Redis abuse controls.

- [ ] **Step 10: Verify + commit**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
rg "recordLoginFailure|recordLoginSuccess|updateLockout|ACCOUNT_LOCKED" \
  apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts \
  apps/api/src/modules/identity-access/infrastructure/http/public-auth.controller.ts
```

Expected `rg`: no active login references.

```bash
git add apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts \
  apps/api/src/modules/identity-access/domain/entities/user-account.entity.ts \
  apps/api/src/modules/identity-access/infrastructure/http/public-auth.controller.ts \
  apps/api/src/shared/http/throttle-limits.ts
git commit -m "fix(auth): replace account lockout with source limits"
```

---

### Task 5: Replace account-lock UI copy with source-rate-limit messaging

**Files:** i18n VI/EN, storefront auth controls, dashboard login.

- [ ] **Step 1: Replace locale key**

Vietnamese:

```ts
rateLimited: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.'
```

English:

```ts
rateLimited: 'Too many login attempts. Please try again later.'
```

Remove `accountLocked` from both locale shapes.

- [ ] **Step 2: Map storefront code**

```ts
if (error === 'AUTH_RATE_LIMITED') return t('errors.rateLimited');
```

Remove `ACCOUNT_LOCKED` mapping.

- [ ] **Step 3: Map dashboard code**

```ts
const message =
  result.code === 'AUTH_RATE_LIMITED'
    ? 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.'
    : result.status === 503
      ? 'Không kết nối được máy chủ. Vui lòng thử lại.'
      : 'Email hoặc mật khẩu không đúng.';
```

- [ ] **Step 4: Verify stale active copy is gone**

```bash
rg "ACCOUNT_LOCKED|accountLocked|Tài khoản tạm.*khóa|temporarily locked" \
  apps/storefront apps/dashboard packages/i18n
```

Expected: no active UI/i18n matches.

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter=@booking/i18n typecheck
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck

git add packages/i18n/src/locales/vi/auth.ts packages/i18n/src/locales/en/auth.ts \
  apps/storefront/app/features/auth/components/auth-form-controls.tsx \
  apps/dashboard/app/routes/auth/login.tsx
git commit -m "fix(auth): show source rate-limit messaging"
```

---

### Task 6: Collect disposable runtime evidence for all 16 acceptance cases

**File:** TEMPORARY `.github/workflows/auth-001-runtime-smoke.yml`; delete in Task 7.

- [ ] **Step 1: Create workflow with PostgreSQL 16 + Redis 7 services**

Install dependencies, run repository-standard migrations/RLS role setup, start API, and set:

```text
AUTH_RATE_LIMIT_HMAC_KEY=auth001-runtime-smoke-secret-0123456789abcdef
```

Create two accounts through existing `/auth/register`, not direct password-hash SQL.

- [ ] **Step 2: Case 1–2 — pair limit + targeted-DoS regression**

From `203.0.113.10`, five wrong victim-A logins => all `401`; sixth => `429 AUTH_RATE_LIMITED`. Immediately correct password from `203.0.113.11` => success. This is the primary invariant proof.

- [ ] **Step 3: Case 3 — IP spray**

From one fresh IP, 30 failed attempts across valid distinct emails; 31st => `429`. Fresh IP still reaches credential evaluation.

- [ ] **Step 4: Case 4–5 — clear semantics**

Prove correct password clears exact pair history, then prove it does not clear IP-wide accumulated failures.

- [ ] **Step 5: Case 6 — unknown/wrong external parity**

Assert exact same `401`, `INVALID_CREDENTIALS`, and message for unknown email vs real account + wrong password. Timing parity is out of scope.

- [ ] **Step 6: Case 7 + 10 — Caddy overwrite/direct API**

Use actual `docker/caddy/Caddyfile` in a disposable Docker network with local-only hostnames/upstream echo/API containers when possible. Send fake incoming `X-BookingOS-Client-IP: 8.8.8.8`; assert upstream receives Caddy's real remote peer, not `8.8.8.8`. Also assert public API host route injects the header.

If Caddy local-certificate behavior makes full runtime routing impractical in CI, combine: (a) `caddy validate` + `caddy adapt` assertions on the actual production file, and (b) a disposable runtime Caddy echo config containing the exact same `header_up X-BookingOS-Client-IP {remote_host}` directive. Do not modify product Caddy semantics just to make smoke easier.

- [ ] **Step 7: Case 8–9 — storefront/dashboard forwarding**

Start SSR apps or run inline server-module probes (no test files) and assert valid single IP is forwarded on login, while malformed/comma-separated values are omitted.

- [ ] **Step 8: Case 11 — missing/malformed IP**

Direct API login with missing/malformed canonical header must continue credential verification, never create a shared socket-peer bucket, and emit `auth.login.client_ip_unavailable` without raw submitted header values.

- [ ] **Step 9: Case 12 — limiter failure really fails open**

Do **not** stop the shared Redis and infer from HTTP, because session storage also uses Redis. Instead run an inline `tsx -e` smoke in the workflow that constructs `LoginUseCase` with:

```text
- real/fake user repository returning a valid password account
- hasher that returns true only for the correct password
- session store spy/fake that records create()
- ILoginAbuseProtection implementation whose precheck/record/clear throw
```

Call `execute()` with correct credentials and assert session `create()` was reached. Run a second inline case with wrong credentials and assert `InvalidCredentials` still throws. No `*.test.*` file is created.

Separately, the real Redis service smoke should disconnect/kill its dedicated `auth-login-abuse` connection or point a disposable instance at an unavailable Redis long enough to prove commands reject within the finite timeout rather than hang indefinitely.

- [ ] **Step 10: Case 13 — distributed observation**

Generate >=20 failures against victim B from >=3 distinct IPs while each pair stays under 5 and IP under 30. Assert `auth.login.distributed_attack_suspected`; correct password from a fourth source still succeeds.

- [ ] **Step 11: Case 14–15 — legacy DB state inert**

Disposable SQL:

```sql
UPDATE users
SET failed_login_count = 4,
    locked_until = now() + interval '1 hour'
WHERE email = 'victim-b@example.test';
```

Correct password from fresh IP succeeds. Then one wrong login does not change either legacy column.

- [ ] **Step 12: Case 16 — frontend copy**

Trigger backend 429 through storefront `/vi/auth/login` and dashboard `/auth/login`; assert Vietnamese retry copy is surfaced and no account-lock wording appears.

- [ ] **Step 13: Run workflow until all 16 cases pass**

On failure: distinguish harness vs product root cause using systematic-debugging; never patch around a failing security assertion.

- [ ] **Step 14: Commit temporary workflow while evidence is needed**

```bash
git add .github/workflows/auth-001-runtime-smoke.yml
git commit -m "ci(auth): add temporary AUTH-001 runtime smoke"
```

Record successful run ID + exact head SHA for PR body.

---

### Task 7: Remove temporary workflow and run final source-only verification

- [ ] **Step 1: Delete temporary workflow**

```bash
git rm .github/workflows/auth-001-runtime-smoke.yml
git commit -m "chore(ci): remove AUTH-001 runtime smoke"
```

- [ ] **Step 2: Classify stale lockout references**

```bash
rg "ACCOUNT_LOCKED|MAX_FAILED_LOGIN_ATTEMPTS|LOGIN_LOCKOUT_MINUTES|recordLoginFailure|recordLoginSuccess|updateLockout|locked_until|failed_login_count" \
  apps packages docs docker .env.example .env.deploy.example
```

KEEP only compatibility declarations/schema/history. CHANGE any active login/UI/deployment documentation. Do not remove DB columns in this PR.

- [ ] **Step 3: Run all static gates**

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
pnpm turbo lint typecheck build
pnpm --filter=@booking/api check:rls
```

- [ ] **Step 4: Revalidate Caddy final head**

Run the Task 1 `caddy validate` command on final source-only head.

- [ ] **Step 5: Verify production HMAC guard**

Production provider construction must fail for missing, `CHANGE_ME*`, dev fallback, and <32-character keys; a generated 64-hex key must construct. This is separate from runtime Redis-command fail-open behavior.

- [ ] **Step 6: Commit only necessary current-doc cleanup**

No unrelated refactors.

---

### Task 8: Review, Draft PR, and integration gate

- [ ] **Step 1: Spec checklist review**

```text
[ ] Caddy overwrites canonical header on every public app/API proxy.
[ ] BFF/API parse one IP only; no fallback to forwarded/socket IP.
[ ] Pair=5/10m, IP=30/10m, observation=20/10m+3 sources.
[ ] Pair+IP failure mutation atomic.
[ ] Dedicated Redis limiter connection has finite command failure; no indefinite global-client behavior.
[ ] Observation failure does not erase successful A+B mutation or change auth result.
[ ] HMAC IDs are domain-separated; no raw PII in Redis keys/telemetry.
[ ] Production HMAC secret fails fast when missing/unsafe.
[ ] Limiter runtime failures fail open for credential verification.
[ ] Unknown email and wrong password same public response.
[ ] Correct password clears pair only.
[ ] Login no longer reads/writes persistent account lockout state.
[ ] Persisted legacy lockedUntil cannot block correct-password login.
[ ] Storefront/dashboard use AUTH_RATE_LIMITED copy; no active ACCOUNT_LOCKED copy.
[ ] No Prisma migration.
[ ] 16 disposable runtime cases green.
[ ] Temporary workflow removed.
[ ] Final source-only CI/Caddy gates green.
```

- [ ] **Step 2: Diff scope review**

Allowed surfaces: auth trust-boundary helpers, identity-access limiter/login, Caddy, auth copy, env/deploy docs, temporary smoke history. Reject global proxy/throttler rewrite, CAPTCHA/MFA, schema migration, or unrelated refactors.

- [ ] **Step 3: Open Draft PR only after separate push/PR authorization**

Suggested:

```text
branch: fix/auth-001-login-abuse-protection
title: fix(auth): prevent targeted login lockout DoS
```

PR body includes root cause/invariant, thresholds, trusted-IP architecture, no DB migration, runtime smoke run+SHA, final source-only CI run+SHA, and `no deploy` note.

- [ ] **Step 4: Request code review and address findings**

Use `superpowers:requesting-code-review`; if no independent subagent is available, perform static checklist review and state that limitation. Use `receiving-code-review` for findings.

- [ ] **Step 5: Fresh verification before completion claim**

Use `superpowers:verification-before-completion`, re-fetch exact branch head/CI, and report separately: code/CI state, runtime smoke state, PR state, merge state, deploy state.

Do not call AUTH-001 production-remediated until the Caddy/BFF/API stack is actually deployed and telemetry confirms trusted source identifiers are not collapsing to one frontend/container identity.
