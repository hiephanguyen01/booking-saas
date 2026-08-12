# Host-Based Dashboard Multi-Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the dashboard's tenant from the `Host` header — every tenant reachable at its own `admin.<slug>.<baseDomain>` and optionally a custom `admin.<their-domain>` they configure themselves — the way the storefront already resolves a tenant.

**Architecture:** `tenant_domains` gains a `kind` discriminator (`storefront` | `dashboard`), so one hostname table, one verification flow and one TLS gate serve both surfaces. Caddy routes any host whose first label is `admin.` to the dashboard container. The dashboard BFF resolves its tenant in root middleware and publishes it through AsyncLocalStorage, which is what keeps `requireTenant()`'s signature — and its 65 call sites — untouched.

**Tech Stack:** NestJS 11 + Prisma (hand-written SQL migrations), Postgres 16 with RLS, Redis, React Router 8 SSR, Caddy 2.

Spec: [`docs/superpowers/specs/2026-08-12-dashboard-host-multitenancy-design.md`](../specs/2026-08-12-dashboard-host-multitenancy-design.md)

## Global Constraints

- **NO TESTS, ever** (AGENTS.md hard rule 1 / ADR 0005). Never create `*.spec.*`, `*.test.*`, e2e files, vitest/jest/playwright config, or a `test` script — even where this plan's structure would normally hold one. Verification is `typecheck` + `lint` + `build` + running the app.
- **Backend flow is `controller → use-case → repository-port → repository`.** No service classes in the application layer.
- **One use-case = one file:** exactly one exported `@Injectable XxxUseCase` with a single public `execute()`.
- **Migrations are hand-authored**, never `prisma migrate dev` (ADR 0004). Every tenant-scoped table needs `tenant_id uuid NOT NULL` plus an RLS migration; `pnpm --filter=@booking/api check:rls` must pass.
- **All tenant data flows through `TenantDbService.forTenant(tenantId, tx => …)`** — one interactive transaction per business operation, never nested, never per-query.
- Prisma enums are PascalCase with `@@map("snake_case")`; the Postgres type is the snake_case name.
- Dashboard UI copy is **Vietnamese**. Style with semantic tokens only — a literal hex in app code is a defect.
- Route URLs come from `~/constants/paths`; backend endpoints from `~/constants/api-paths`. Never string-build either.
- Frontends never fetch the backend from the browser — loaders/actions only.
- Node ≥ 22.22.0, pnpm 10.13.1. Never npm/yarn.
- The reserved dashboard label is the literal string `admin` and the prefix is `admin.` — fixed, not configurable.

**Full static check** (referred to below as *the static check*):

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build \
  && pnpm --filter=@booking/api check:rls
```

---

### Task 1: `tenant_domains.kind` column, index and backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma:837-852` (model `TenantDomain`), plus a new `enum` block beside the others around line 36-65
- Create: `apps/api/prisma/migrations/20260812000000_tenant_domain_kind/migration.sql`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: Prisma type `TenantDomainKind` with members `storefront` and `dashboard`; `TenantDomain.kind: TenantDomainKind`; Postgres type `tenant_domain_kind`; index `tenant_domains_one_primary_per_tenant_key` now on `(tenant_id, kind) WHERE is_primary`.

- [ ] **Step 1: Add the enum to `schema.prisma`**

Place it with the other enums (they run from line 36):

```prisma
/// Which surface a tenant hostname serves (§6.1). One hostname is only ever one of these.
enum TenantDomainKind {
  storefront
  dashboard

  @@map("tenant_domain_kind")
}
```

- [ ] **Step 2: Add the column to the `TenantDomain` model**

In `model TenantDomain`, after `isPrimary`:

```prisma
  kind              TenantDomainKind @default(storefront)
```

- [ ] **Step 3: Write the migration**

Create `apps/api/prisma/migrations/20260812000000_tenant_domain_kind/migration.sql`:

```sql
-- Which surface a hostname serves. Existing rows are all storefront hosts.
CREATE TYPE "tenant_domain_kind" AS ENUM ('storefront', 'dashboard');

ALTER TABLE "tenant_domains"
  ADD COLUMN "kind" "tenant_domain_kind" NOT NULL DEFAULT 'storefront';

-- A tenant now has one primary per surface, not one primary overall.
DROP INDEX IF EXISTS "tenant_domains_one_primary_per_tenant_key";
CREATE UNIQUE INDEX "tenant_domains_one_primary_per_tenant_key"
  ON "tenant_domains" ("tenant_id", "kind")
  WHERE "is_primary";

CREATE INDEX "tenant_domains_kind_idx" ON "tenant_domains" ("kind");

-- Backfill: every existing tenant gets a verified, primary dashboard host at
-- admin.<slug>.<base domain of its own primary storefront host>. Deriving the
-- base from the tenant's own primary host keeps this correct across the staging
-- and .localhost families the seed registers, without reading app config.
--
-- ON CONFLICT DO NOTHING, not a plain INSERT: tenant_domains_hostname_key is
-- global, so a tenant that already registered this exact name as a storefront
-- host must be left for an operator rather than failing the whole deploy.
INSERT INTO "tenant_domains" ("id", "tenant_id", "hostname", "is_primary", "kind", "verified_at", "created_at", "updated_at")
SELECT gen_random_uuid(),
       t."id",
       'admin.' || d."hostname",
       true,
       'dashboard',
       now(),
       now(),
       now()
FROM "tenants" t
JOIN "tenant_domains" d
  ON d."tenant_id" = t."id"
 AND d."is_primary"
 AND d."kind" = 'storefront'
 AND d."verified_at" IS NOT NULL
ON CONFLICT ("hostname") DO NOTHING;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

```bash
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
```

Expected: the migration applies, and `TenantDomainKind` appears in the generated client.

- [ ] **Step 5: Confirm the backfill and the index**

```bash
docker compose exec -T postgres psql -U postgres -d bookingos -c \
  "SELECT hostname, kind, is_primary FROM tenant_domains ORDER BY tenant_id, kind, hostname;"
```

Expected: each demo tenant shows its storefront hosts plus one `admin.<storefront primary>` row with `kind = dashboard`, `is_primary = t`. Confirm no tenant has two primaries of the same kind.

- [ ] **Step 6: Verify RLS coverage still passes**

```bash
pnpm --filter=@booking/api check:rls
```

Expected: pass. `tenant_domains` already carries the `tenant_isolation` policy; adding a column does not need a new one.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260812000000_tenant_domain_kind
git commit -m "feat(tenancy): add kind discriminator to tenant_domains"
```

---

### Task 2: Kind-aware host cache and resolution

**Files:**
- Modify: `apps/api/src/modules/tenancy/domain/ports/tenant-cache.port.ts`
- Modify: `apps/api/src/modules/tenancy/infrastructure/services/redis-tenant-cache.ts`
- Modify: `apps/api/src/modules/tenancy/domain/ports/tenant-domain-repository.port.ts`
- Modify: `apps/api/src/modules/tenancy/infrastructure/repositories/prisma-tenant-domain.repository.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/check-domain-tls-allowed.use-case.ts`
- Create: `apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-admin-host.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/infrastructure/http/tenancy.module.ts`

**Interfaces:**
- Consumes: `TenantDomainKind` from Task 1.
- Produces:
  - `type TenantHostKind = 'storefront' | 'dashboard'`
  - `interface CachedHost { tenantId: string; kind: TenantHostKind }`
  - `ITenantCache.getHost(hostname): Promise<CachedHost | null | undefined>` and `setHost(hostname, value: CachedHost | null): Promise<void>`
  - `DomainRecord.kind: TenantHostKind`
  - `ResolveTenantByAdminHostUseCase.execute(rawHost: string): Promise<AdminHostTenant>` where `interface AdminHostTenant { id: string; name: string; slug: string; branding: DashboardBrandConfig | null; subscriptionExpired: boolean }`

- [ ] **Step 1: Widen the cache port**

Replace the body of `tenant-cache.port.ts`:

```ts
export const TENANT_CACHE = Symbol('TENANT_CACHE');

/** Which surface a resolved hostname serves. Mirrors `tenant_domain_kind`. */
export type TenantHostKind = 'storefront' | 'dashboard';

export interface CachedHost {
  tenantId: string;
  kind: TenantHostKind;
}

/**
 * Host → tenant resolution cache (§6.1), Redis-backed with a 60s TTL. Unknown
 * hosts are negatively cached (null) so a flood of requests for a bogus Host
 * cannot hammer the database.
 *
 * The entry carries `kind` because one table now maps both storefront and
 * dashboard hostnames, and a caller that wants one must never be handed the
 * other.
 */
export interface ITenantCache {
  /** `undefined` = cache miss; `null` = negatively cached (no such host). */
  getHost(hostname: string): Promise<CachedHost | null | undefined>;
  setHost(hostname: string, value: CachedHost | null): Promise<void>;
  invalidateHost(hostname: string): Promise<void>;
}
```

- [ ] **Step 2: Update the Redis adapter, bumping the key prefix**

Replace the body of `redis-tenant-cache.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../../shared/redis/redis.module';
import type { CachedHost, ITenantCache, TenantHostKind } from '../../domain/ports/tenant-cache.port';

const TTL_SECONDS = 60;
/** Sentinel stored for a negatively-cached (unknown) host. */
const NEGATIVE = '';

@Injectable()
export class RedisTenantCache implements ITenantCache {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * `v2` because the stored shape changed from a bare tenant id to
   * `<tenantId>:<kind>`. Without the bump, a freshly deployed process would read
   * v1 entries still inside their 60s TTL and take the whole string as a tenant id.
   */
  private key(hostname: string): string {
    return `host:v2:${hostname}`;
  }

  async getHost(hostname: string): Promise<CachedHost | null | undefined> {
    const value = await this.redis.get(this.key(hostname));
    if (value === null) return undefined; // miss
    if (value === NEGATIVE) return null; // negatively cached
    const separator = value.lastIndexOf(':');
    if (separator === -1) return undefined; // unreadable — treat as a miss and re-resolve
    const tenantId = value.slice(0, separator);
    const kind = value.slice(separator + 1);
    if (kind !== 'storefront' && kind !== 'dashboard') return undefined;
    return { tenantId, kind: kind as TenantHostKind };
  }

  async setHost(hostname: string, value: CachedHost | null): Promise<void> {
    const stored = value ? `${value.tenantId}:${value.kind}` : NEGATIVE;
    await this.redis.set(this.key(hostname), stored, 'EX', TTL_SECONDS);
  }

  async invalidateHost(hostname: string): Promise<void> {
    await this.redis.del(this.key(hostname));
  }
}
```

- [ ] **Step 3: Carry `kind` on `DomainRecord`**

In `tenant-domain-repository.port.ts`, import the kind and add the field to both `DomainRecord` and `CreateDomainData`:

```ts
import type { TenantHostKind } from './tenant-cache.port';
```

```ts
export interface DomainRecord {
  id: string;
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  kind: TenantHostKind;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

export interface CreateDomainData {
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  kind: TenantHostKind;
  verificationToken: string | null;
  verifiedAt: Date | null;
}
```

Add one method to `ITenantDomainRepository`, beside `listByTenant`:

```ts
  listByTenantAndKind(tenantId: string, kind: TenantHostKind): Promise<DomainRecord[]>;
```

- [ ] **Step 4: Map `kind` in the repository and scope `setPrimary` to it**

In `prisma-tenant-domain.repository.ts`, add `kind: d.kind` to `toRecord`, then add the new method and fix `setPrimary`:

```ts
  async listByTenantAndKind(tenantId: string, kind: TenantHostKind): Promise<DomainRecord[]> {
    const rows = await this.prisma.admin.tenantDomain.findMany({
      where: { tenantId, kind },
      orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async setPrimary(tenantId: string, id: string, tx: PrismaTx): Promise<DomainRecord> {
    // Load first: the primary being cleared must be the one of the SAME kind.
    // Clearing by tenant alone would demote the other surface's primary, and the
    // partial unique index is on (tenant_id, kind) so nothing would catch it.
    const target = await tx.tenantDomain.findUniqueOrThrow({ where: { id } });
    await tx.tenantDomain.updateMany({
      where: { tenantId, kind: target.kind, isPrimary: true },
      data: { isPrimary: false },
    });
    return toRecord(
      await tx.tenantDomain.update({ where: { id }, data: { isPrimary: true } }),
    );
  }
```

Import `TenantHostKind` from `../../domain/ports/tenant-cache.port` at the top.

- [ ] **Step 5: Filter the storefront resolver by kind**

In `resolve-tenant-by-host.use-case.ts`, replace the cache/lookup block inside `execute`:

```ts
    let cached = await this.cache.getHost(hostname);
    if (cached === undefined) {
      const domain = await this.domains.findByHostname(hostname);
      // Only a verified domain resolves — an unverified custom domain isn't live.
      cached = domain && domain.verifiedAt
        ? { tenantId: domain.tenantId, kind: domain.kind }
        : null;
      await this.cache.setHost(hostname, cached);
    }
    // A dashboard hostname is not a storefront. Ten modules resolve a tenant
    // through this use-case; without this guard an admin host would read as a
    // valid storefront everywhere from checkout to legal documents.
    if (cached === null || cached.kind !== 'storefront') {
      throw new UnknownTenantHost(hostname);
    }
    const tenantId = cached.tenantId;
```

Leave everything below (`this.tenants.findById`, the stale-cache eviction, the subscription evaluation) as it is.

- [ ] **Step 6: Keep the TLS gate kind-agnostic**

In `check-domain-tls-allowed.use-case.ts`, replace the lookup block. Both surfaces need certificates, so this deliberately does **not** filter:

```ts
    let cached = await this.cache.getHost(hostname);
    if (cached === undefined) {
      const domain = await this.domains.findByHostname(hostname);
      cached = domain && domain.verifiedAt
        ? { tenantId: domain.tenantId, kind: domain.kind }
        : null;
      await this.cache.setHost(hostname, cached);
    }
    // Kind-agnostic on purpose: a verified dashboard host needs a certificate
    // exactly as much as a storefront one.
    return cached !== null;
```

- [ ] **Step 7: Add the admin-host resolver**

Create `resolve-tenant-by-admin-host.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { dashboardBrandConfigSchema, type DashboardBrandConfig } from '@booking/contracts';
import { normalizeHostname } from '../../../../shared/http/hostname';
import { evaluateSubscription } from '../../domain/subscription-status';
import { TENANT_REPOSITORY, type ITenantRepository } from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import {
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';
import { UnknownTenantHost } from '../../domain/errors/tenancy-errors';

export interface AdminHostTenant {
  id: string;
  name: string;
  slug: string;
  branding: DashboardBrandConfig | null;
  /** Renders a renewal banner. It does NOT lock the console — see below. */
  subscriptionExpired: boolean;
  /** True when the tenant row is suspended; the BFF turns this into a 403 page. */
  suspended: boolean;
}

/**
 * Resolves a dashboard Host header to its tenant. The mirror image of
 * {@link ResolveTenantByHostUseCase}, filtered to `kind='dashboard'` and sharing
 * its Redis host cache.
 *
 * Deliberately does NOT apply the storefront's `live` rule. A tenant whose
 * subscription has lapsed must still reach the console — that is where they
 * renew, and locking them out of it is the one failure mode that cannot be
 * recovered from in-product. An expired subscription is reported so the shell can
 * show a banner.
 *
 * A suspended tenant is reported too rather than 404'd. The caller already knows
 * this hostname exists — they typed it — so answering "not found" only makes a
 * deliberate suspension look like a broken domain, and the operator has no way to
 * tell the difference. The BFF renders it as an explicit 403.
 */
@Injectable()
export class ResolveTenantByAdminHostUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(rawHost: string): Promise<AdminHostTenant> {
    const hostname = normalizeHostname(rawHost);
    if (!hostname) throw new UnknownTenantHost(rawHost);

    let cached = await this.cache.getHost(hostname);
    if (cached === undefined) {
      const domain = await this.domains.findByHostname(hostname);
      cached = domain && domain.verifiedAt
        ? { tenantId: domain.tenantId, kind: domain.kind }
        : null;
      await this.cache.setHost(hostname, cached);
    }
    if (cached === null || cached.kind !== 'dashboard') {
      throw new UnknownTenantHost(hostname);
    }

    const tenant = await this.tenants.findById(cached.tenantId);
    if (!tenant) {
      await this.cache.invalidateHost(hostname);
      throw new UnknownTenantHost(hostname);
    }

    const selection = await this.currentSubscriptions.findByTenant(tenant.id);
    const evaluation = evaluateSubscription(
      selection.current?.subscription ?? null,
      selection.evaluatedAt,
    );
    const branding = dashboardBrandConfigSchema.safeParse(tenant.themeConfig);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      branding: branding.success ? branding.data : null,
      subscriptionExpired: !evaluation.dashboardWritable,
      suspended: tenant.status !== 'active',
    };
  }
}
```

- [ ] **Step 8: Register the new use-case**

In `tenancy.module.ts`, import `ResolveTenantByAdminHostUseCase` and add it to both the `providers` array (next to `ResolveTenantByHostUseCase`) and the `exports` array, so other modules and the public controller can inject it.

- [ ] **Step 9: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

Expected: pass. Type errors here are the point — they enumerate every call site of the old cache shape.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/tenancy
git commit -m "feat(tenancy): resolve storefront and dashboard hosts separately"
```

---

### Task 3: Close the silent-breakage set

Every query that reads "the primary domain" without filtering kind now sees two `is_primary` rows per tenant and starts returning the admin host non-deterministically. None of them fail loudly, so they are fixed together in one reviewable change.

**Files:**
- Modify: `apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts:80-82,103-105,185-187,203-205`
- Modify: `apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate.repository.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/get-tenant-detail.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/delete-domain.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/domain/entities/tenant-domain.entity.ts:127-147`

**Interfaces:**
- Consumes: `DomainRecord.kind` and `ITenantDomainRepository.listByTenantAndKind` from Task 2.
- Produces: no new exports. `assertDeletableFromPortfolio` keeps its name and signature; its contract narrows to same-kind siblings.

- [ ] **Step 1: Scope the four notification sub-selects**

In `prisma-notification.reader.ts`, each of the four `primary_hostname` sub-selects reads:

```sql
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
              LIMIT 1) AS primary_hostname
```

Add the kind predicate to all four:

```sql
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'storefront'
              LIMIT 1) AS primary_hostname
```

They are at lines 80-82 (`loadBrand`), 103-105 (`loadBookingContext`), 185-187 (`loadListingContext`) and 203-205 (`loadPartnerContext`). Confirm all four are changed:

```bash
rg -c "kind = 'storefront'" apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts
```

Expected: `4`.

- [ ] **Step 2: Scope the affiliate hostname lookup**

In `prisma-affiliate.repository.ts`, the include reads
`domains: { where: { isPrimary: true }, select: { hostname: true }, take: 1 }`. Change it to:

```ts
      domains: {
        // Storefront only: this hostname builds affiliate referral links, which
        // must land a visitor on the shop, never on the admin console.
        where: { isPrimary: true, kind: 'storefront' },
        select: { hostname: true },
        take: 1,
      },
```

- [ ] **Step 3: Scope the admin tenant-detail primary domain**

In `get-tenant-detail.use-case.ts`, `domains.find((d) => d.isPrimary)` feeds `primaryDomain`, which renders the "view storefront" link on the admin tenant screen. Change it to:

```ts
      primaryDomain: domains.find((d) => d.isPrimary && d.kind === 'storefront') ?? null,
```

- [ ] **Step 4: Make the portfolio rule per-kind**

In `tenant-domain.entity.ts`, `assertDeletableFromPortfolio` currently takes the tenant's full domain list. Update its docblock and keep the signature — the caller now passes same-kind siblings only:

```ts
/**
 * Portfolio rule: removing a verified primary domain is refused while it is the
 * tenant's only verified one of ITS OWN KIND — a live storefront must never be
 * orphaned, and neither must the console.
 *
 * `allTenantDomains` is the tenant's verified-or-not domain list **for the target's
 * kind**; the target is excluded internally, so callers cannot get the contract
 * wrong. Passing every kind would let the last dashboard host be deleted merely
 * because a storefront host still exists.
 *
 * NOTE the asymmetry, preserved from the pre-refactor code: siblings are filtered by
 * `verified`, NOT by `primary`. So deleting the primary while another verified (but
 * non-primary) domain exists succeeds and leaves the tenant with no primary at all.
 * Recorded as a known gap rather than tightened here.
 */
```

- [ ] **Step 5: Pass same-kind siblings from the delete path**

In `delete-domain.use-case.ts`, replace `listByTenant` with the kind-scoped read:

```ts
    if (target.isPrimary && target.isVerified) {
      const siblings = (await this.domains.listByTenantAndKind(tenantId, domain.kind)).map((d) => ({
        id: d.id,
        isVerified: d.verifiedAt !== null,
      }));
      assertDeletableFromPortfolio(
        { id: target.id, isPrimary: target.isPrimary, isVerified: target.isVerified },
        siblings,
      );
    }
```

- [ ] **Step 6: Sweep for any site this plan missed**

```bash
rg -n "isPrimary: true|is_primary = true|d\.isPrimary|\{ isPrimary" apps/api/src --glob '!*/migrations/*'
```

Expected: every hit is either inside `modules/tenancy` domain/repository code that is legitimately kind-agnostic, or already carries a `kind` predicate from steps 1-5. If a new hit appears, scope it the same way and note it in the commit message.

- [ ] **Step 7: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "fix(tenancy): scope every primary-domain read to its surface kind"
```

---

### Task 4: Domain lifecycle accepts `kind` and enforces the `admin.` prefix

**Files:**
- Modify: `packages/contracts/src/contracts/tenancy.ts:129-133` (`addDomainInputSchema`), `:342-351` (`domainResponseSchema`)
- Modify: `apps/api/src/modules/tenancy/domain/errors/tenancy-errors.ts`
- Modify: `apps/api/src/modules/tenancy/domain/hostname.ts`
- Modify: `apps/api/src/modules/tenancy/domain/entities/tenant-domain.entity.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/add-domain.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/list-domains.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/create-tenant.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/application/tenancy.mapper.ts:144-166`
- Modify: `apps/api/src/modules/tenancy/infrastructure/http/dto/tenancy.dto.ts`
- Modify: `apps/api/prisma/seed/tenants/booking-studio.ts:104-113`, `apps/api/prisma/seed/tenants/booking-stad.ts` (same block)

**Interfaces:**
- Consumes: `TenantHostKind`, `DomainRecord.kind`, `listByTenantAndKind` (Task 2).
- Produces:
  - `AddDomainInput.kind: 'storefront' | 'dashboard'` (defaults to `'storefront'`)
  - `DomainResponse.kind: 'storefront' | 'dashboard'`
  - `ADMIN_HOST_PREFIX = 'admin.'` and `buildDefaultAdminSubdomain(slug, baseDomain): string` exported from `tenancy/domain/hostname.ts`
  - Errors `AdminDomainPrefixRequired` and `AdminPrefixReserved`
  - `TenantDomain.provisionDefaultSubdomain` and `TenantDomain.requestCustomDomain` both take `kind: TenantHostKind`
  - `ListDomainsUseCase.execute(tenantId)` unchanged — it returns every kind; the UI groups them

- [ ] **Step 1: Add `kind` to the contracts**

In `packages/contracts/src/contracts/tenancy.ts`:

```ts
export const tenantDomainKindSchema = z.enum(['storefront', 'dashboard']);
export type TenantDomainKind = z.infer<typeof tenantDomainKindSchema>;

export const addDomainInputSchema = z.object({
  hostname: hostnameSchema,
  isPrimary: z.boolean().default(false),
  /** Which surface the hostname serves. A dashboard host must start with `admin.`. */
  kind: tenantDomainKindSchema.default('storefront'),
});
export type AddDomainInput = z.infer<typeof addDomainInputSchema>;
```

And add `kind: tenantDomainKindSchema,` to `domainResponseSchema`, after `isPrimary`.

- [ ] **Step 2: Add the prefix helpers to the domain layer**

Append to `apps/api/src/modules/tenancy/domain/hostname.ts`:

```ts
/**
 * The reserved first label for a dashboard hostname.
 *
 * This is a routing contract, not a preference. Caddy picks the storefront or
 * dashboard upstream from the Host header alone, with no per-tenant config and no
 * way to ask the API which surface a hostname belongs to (its on-demand-TLS `ask`
 * hook only answers whether a certificate may be issued). The prefix is what makes
 * that decision expressible as a static matcher — see docker/caddy/Caddyfile.
 */
export const ADMIN_HOST_PREFIX = 'admin.';

export function isAdminHostname(hostname: string): boolean {
  return hostname.startsWith(ADMIN_HOST_PREFIX);
}

/** The platform-owned admin subdomain provisioned with every tenant. */
export function buildDefaultAdminSubdomain(slug: string, baseDomain: string): string {
  return `${ADMIN_HOST_PREFIX}${slug}.${baseDomain}`;
}
```

- [ ] **Step 3: Add the two symmetric errors**

Append to `tenancy-errors.ts`:

```ts
export class AdminDomainPrefixRequired extends DomainError {
  constructor(hostname: string) {
    super(
      'ADMIN_DOMAIN_PREFIX_REQUIRED',
      400,
      `A dashboard hostname must start with "admin." — "${hostname}" does not`,
    );
  }
}

export class AdminPrefixReserved extends DomainError {
  constructor(hostname: string) {
    super(
      'ADMIN_PREFIX_RESERVED',
      400,
      `"${hostname}" starts with "admin.", which is reserved for dashboard hostnames`,
    );
  }
}
```

- [ ] **Step 4: Thread `kind` through the entity**

In `tenant-domain.entity.ts`, add `kind: TenantHostKind` to both `TenantDomainState` and `NewTenantDomain`, import the type from `../ports/tenant-cache.port`, add a `get kind()` accessor, and take it as an input on both factories:

```ts
  static provisionDefaultSubdomain(input: {
    tenantId: string;
    hostname: string;
    kind: TenantHostKind;
    now: Date;
  }): NewTenantDomain {
    return {
      tenantId: input.tenantId,
      hostname: input.hostname,
      isPrimary: true,
      kind: input.kind,
      verificationToken: null,
      verifiedAt: input.now,
    };
  }

  static requestCustomDomain(input: {
    tenantId: string;
    hostname: string;
    isPrimary: boolean;
    kind: TenantHostKind;
    randomHex: string;
  }): NewTenantDomain {
    return {
      tenantId: input.tenantId,
      hostname: input.hostname,
      isPrimary: input.isPrimary,
      kind: input.kind,
      verificationToken: buildVerificationToken(input.randomHex),
      verifiedAt: null,
    };
  }
```

- [ ] **Step 5: Enforce the prefix rules in `AddDomainUseCase`**

In `add-domain.use-case.ts`, after `const hostname = normalizeHostname(input.hostname);` and before the `DomainTaken` check:

```ts
    // Symmetric rules. Without the second one a storefront host could claim
    // `admin.…` and Caddy would route real shop traffic to the console.
    const adminHost = isAdminHostname(hostname);
    if (input.kind === 'dashboard' && !adminHost) {
      throw new AdminDomainPrefixRequired(hostname);
    }
    if (input.kind === 'storefront' && adminHost) {
      throw new AdminPrefixReserved(hostname);
    }
```

Pass `kind: input.kind` into `TenantDomain.requestCustomDomain`, and import `isAdminHostname` plus the two errors.

- [ ] **Step 6: Provision the admin subdomain with every new tenant**

In `create-tenant.use-case.ts`, alongside the existing subdomain:

```ts
    const subdomain = buildDefaultSubdomain(input.slug, this.config.baseDomain);
    const adminSubdomain = buildDefaultAdminSubdomain(input.slug, this.config.baseDomain);
    for (const hostname of [subdomain, adminSubdomain]) {
      if (await this.domains.findByHostname(hostname)) {
        throw new DomainTaken(hostname);
      }
    }
```

Inside the existing transaction, after the storefront `primaryDomain` create and before the outbox emit:

```ts
      // The console host is provisioned with the tenant, not sold as an add-on:
      // /tenant and /partner exist only on a tenant host, so a tenant without one
      // would have no way in at all.
      await this.domains.create(
        TenantDomain.provisionDefaultSubdomain({
          tenantId: tenant.id,
          hostname: adminSubdomain,
          kind: 'dashboard',
          now: new Date(),
        }),
        tx,
      );
```

Add `kind: 'storefront'` to the existing `provisionDefaultSubdomain` call, and invalidate both hosts after the transaction:

```ts
    await this.cache.invalidateHost(subdomain);
    await this.cache.invalidateHost(adminSubdomain);
```

- [ ] **Step 7: Expose `kind` on the wire**

In `tenancy.mapper.ts`, add `kind: d.kind,` to the object returned by `toDomainResponse`, after
`isPrimary`. In `infrastructure/http/dto/tenancy.dto.ts`, declare the field on both
`DomainResponseDto` and `AddDomainDto`:

```ts
  @ApiProperty({ enum: ['storefront', 'dashboard'], example: 'storefront' })
  kind!: 'storefront' | 'dashboard';
```

On `AddDomainDto` mark it optional, since `addDomainInputSchema` defaults it:

```ts
  @ApiPropertyOptional({ enum: ['storefront', 'dashboard'], default: 'storefront' })
  kind?: 'storefront' | 'dashboard';
```

- [ ] **Step 8: Record that the DNS targets are shared**

`CheckDomainDnsUseCase` compares against `TenancyConfig.storefrontCname` / `storefrontIpv4`. A console
host points at the same Caddy, so those values are already correct for both kinds and **no logic
changes**. The names are now half-right, though, so state it rather than leave the next reader to
wonder. Amend the field docs in `apps/api/src/modules/tenancy/domain/ports/tenancy-config.port.ts`:

```ts
export interface TenancyConfig {
  /** Base domain for auto-provisioned tenant subdomains, e.g. `bookingos.vn`. */
  baseDomain: string;
  /**
   * Hostname a tenant points a *subdomain* at with a CNAME, e.g.
   * `connect.stg.bookingos.vn`. It is only a CNAME target — it is not a tenant
   * domain and never terminates TLS itself.
   *
   * Named for the storefront, but correct for a console host too: both surfaces
   * sit behind the same ingress, so both point here. The env var
   * (`PLATFORM_STOREFRONT_CNAME`) is deliberately not renamed — that is a real
   * ops step on a running stack, bought for nothing but a tidier name.
   */
  storefrontCname: string;
  /**
   * Public IPv4 a tenant points an *apex* domain at with an A record. Apex
   * records cannot be CNAMEs, and using the tenant's own root domain is common
   * here, so both targets have to be published. Shared with console hosts for the
   * same reason as `storefrontCname`.
   */
  storefrontIpv4: string;
}
```

- [ ] **Step 9: Seed an admin host for both demo tenants**

In `apps/api/prisma/seed/tenants/booking-studio.ts`, replace the domain loop:

```ts
  // Staging host is primary; the `.localhost` host rides along so ONE seed serves
  // both environments without an env switch. Bare `localhost`/`127.0.0.1` are
  // deliberately NOT mapped — the storefront serves the platform landing there.
  for (const [hostname, isPrimary, kind] of [
    ['bookingstudio.stg.bookingos.vn', true, 'storefront'],
    ['bookingstudio.localhost', false, 'storefront'],
    ['admin.bookingstudio.stg.bookingos.vn', true, 'dashboard'],
    ['admin.bookingstudio.localhost', false, 'dashboard'],
  ] as const) {
    await prisma.tenantDomain.upsert({
      where: { hostname },
      update: { kind },
      create: { tenantId: tenant.id, hostname, isPrimary, kind, verifiedAt: new Date() },
    });
  }
```

Apply the identical change in `apps/api/prisma/seed/tenants/booking-stad.ts`, substituting `bookingstad` for `bookingstudio`.

- [ ] **Step 10: Re-seed and verify**

```bash
pnpm --filter=@booking/api seed
docker compose exec -T postgres psql -U postgres -d bookingos -c \
  "SELECT hostname, kind, is_primary FROM tenant_domains WHERE kind = 'dashboard' ORDER BY hostname;"
```

Expected: four dashboard rows — the staging and `.localhost` host for each demo tenant, one primary per tenant.

- [ ] **Step 11: Verify and commit**

```bash
pnpm turbo lint typecheck --filter=@booking/api --filter=@booking/contracts
git add packages/contracts apps/api/src apps/api/prisma
git commit -m "feat(tenancy): manage dashboard domains behind a reserved admin. prefix"
```

---

### Task 5: Publish the admin hostname on the public and session contracts

**Files:**
- Modify: `packages/contracts/src/contracts/tenancy.ts:489-497` (`publicTenantResponseSchema`)
- Modify: `packages/contracts/src/contracts/auth.ts:170-182` (`scopeMembershipSchema`)
- Modify: `apps/api/src/modules/tenancy/application/tenancy.mapper.ts:114-124` (`toPublicTenantResponse`)
- Modify: `apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/domain/ports/tenant-domain-repository.port.ts`
- Modify: `apps/api/src/modules/tenancy/infrastructure/repositories/prisma-tenant-domain.repository.ts`
- Modify: `apps/api/src/modules/identity-access/infrastructure/services/prisma-session-info.reader.ts`
- Modify: `apps/api/src/modules/tenancy/infrastructure/http/dto/tenancy.dto.ts`

**Interfaces:**
- Consumes: `DomainRecord.kind` (Task 2).
- Produces:
  - `PublicTenantResponse.adminHostname: string | null`
  - `ScopeMembership.adminHostname: string | null`
  - `ITenantDomainRepository.findPrimaryHostname(tenantId, kind): Promise<string | null>`

- [ ] **Step 1: Add the repository read**

In `tenant-domain-repository.port.ts`:

```ts
  /** The tenant's primary verified hostname for one surface, or null. */
  findPrimaryHostname(tenantId: string, kind: TenantHostKind): Promise<string | null>;
```

In `prisma-tenant-domain.repository.ts`:

```ts
  async findPrimaryHostname(tenantId: string, kind: TenantHostKind): Promise<string | null> {
    const row = await this.prisma.admin.tenantDomain.findFirst({
      where: { tenantId, kind, isPrimary: true, verifiedAt: { not: null } },
      select: { hostname: true },
    });
    return row?.hostname ?? null;
  }
```

- [ ] **Step 2: Add the field to the public tenant contract**

In `packages/contracts/src/contracts/tenancy.ts`:

```ts
export const publicTenantResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  vertical: verticalSchema,
  defaultLocale: localeSchema,
  themeConfig: themeConfigSchema,
  live: z.boolean(),
  /**
   * The tenant's console host, so the storefront can link a partner or affiliate
   * to the right dashboard instead of the platform one. Null when the tenant has
   * no verified dashboard domain.
   */
  adminHostname: z.string().nullable(),
});
```

- [ ] **Step 3: Fill it in the mapper and the resolver**

`toPublicTenantResponse` gains a parameter rather than reaching for a repository — the mapper stays free of I/O:

```ts
export function toPublicTenantResponse(
  t: TenantRecord,
  live: boolean,
  adminHostname: string | null,
): PublicTenantResponse {
```

with `adminHostname,` added to the returned object. In `resolve-tenant-by-host.use-case.ts`, resolve it alongside the subscription and pass it through:

```ts
    const [selection, adminHostname] = await Promise.all([
      this.currentSubscriptions.findByTenant(tenantId),
      this.domains.findPrimaryHostname(tenantId, 'dashboard'),
    ]);
```

```ts
    return toPublicTenantResponse(tenant, live, adminHostname);
```

Update `PublicTenantResponseDto` in `dto/tenancy.dto.ts` to declare the field.

- [ ] **Step 4: Add `adminHostname` to scope memberships**

In `packages/contracts/src/contracts/auth.ts`, inside `scopeMembershipSchema` after `tenantBranding`:

```ts
  /** The tenant's console host, for cross-host links on the platform workspaces page. */
  adminHostname: z.string().nullable(),
```

- [ ] **Step 5: Resolve it in the session reader**

In `prisma-session-info.reader.ts`, the `roleAssignment.findMany` include already pulls `tenant: { select: { id, name, themeConfig } }`. Extend it to pull the console host in the same query — no N+1:

```ts
        tenant: {
          select: {
            id: true,
            name: true,
            themeConfig: true,
            domains: {
              where: { kind: 'dashboard', isPrimary: true, verifiedAt: { not: null } },
              select: { hostname: true },
              take: 1,
            },
          },
        },
```

and in the membership literal, after `tenantBranding`:

```ts
          adminHostname: row.tenant?.domains[0]?.hostname ?? null,
```

- [ ] **Step 6: Verify**

```bash
pnpm turbo lint typecheck --filter=@booking/api --filter=@booking/contracts
```

Expected: pass. The storefront and dashboard will not typecheck yet — they consume these contracts and are updated in Tasks 7-9.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts apps/api/src
git commit -m "feat(tenancy): expose each tenant's console hostname on public and session payloads"
```

---

### Task 6: Tenant settings screen manages dashboard domains

**Files:**
- Modify: `apps/dashboard/app/features/tenant/components/settings/tenant-domains-card.tsx`
- Modify: `apps/dashboard/app/features/tenant/components/settings/settings-fields.ts` (`domainFields`)
- Modify: `apps/dashboard/app/features/tenant/server/settings-actions.server.ts`
- Modify: `apps/dashboard/app/routes/tenant/settings.tsx`

**Interfaces:**
- Consumes: `DomainResponse.kind` and `AddDomainInput.kind` (Task 4).
- Produces: `TenantDomainsCard` takes a new required prop `kind: TenantDomainKind`; the settings route renders it twice.

- [ ] **Step 1: Make the card kind-aware**

Add `kind` to the `TenantDomainsCard` props and filter the list it renders:

```ts
  kind: TenantDomainKind;
```

```ts
  const rows = (domains ?? []).filter((domain) => domain.kind === kind);
```

Render `rows` where the component currently renders `domains`. Drive the heading and helper copy from `kind` so the two cards read differently:

```ts
  const copy = kind === 'dashboard'
    ? {
        title: 'Tên miền trang quản trị',
        description:
          'Địa chỉ đội ngũ của bạn dùng để đăng nhập và vận hành. Tên miền phải bắt đầu bằng "admin.".',
        placeholder: 'admin.tencuaban.vn',
      }
    : {
        title: 'Tên miền cửa hàng',
        description: 'Địa chỉ khách hàng truy cập để xem và đặt dịch vụ.',
        placeholder: 'datcho.tencuaban.vn',
      };
```

- [ ] **Step 2: Carry `kind` on the add-domain form**

In `settings-fields.ts`, `domainFields` drives the `GenericForm` bound to `addDomainInputSchema`. Make it a function of the kind so the placeholder matches, and keep `kind` out of the visible fields — the action supplies it:

```ts
export function domainFields(placeholder: string): FieldConfig<AddDomainInput>[] {
```

Update the single call site inside `tenant-domains-card.tsx` to `domainFields(copy.placeholder)`.

- [ ] **Step 3: Send `kind` from the action**

In `settings-actions.server.ts`, the add-domain branch posts to `apiPaths.tenant.domains`. The form now submits a `kind` field; parse it with `addDomainInputSchema` as the rest of the payload already is, so an absent value defaults to `'storefront'` and a bad one is rejected by the same schema the backend uses. Add a hidden input carrying `kind` to the card's `GenericForm`:

```tsx
<input type="hidden" name="kind" value={kind} />
```

- [ ] **Step 4: Render both cards**

In `routes/tenant/settings.tsx`, where `TenantDomainsCard` is rendered once, render it twice — storefront first, then dashboard — passing the same loader data and `kind="storefront"` / `kind="dashboard"`.

- [ ] **Step 5: Verify in the running app**

```bash
pnpm dev
```

Sign in at `localhost:5174` as `owner@bookingstudio.vn` / `demo-password`, open tenant settings, and confirm: two domain cards; the dashboard card lists `admin.bookingstudio.*`; adding `quanly.example.vn` under the dashboard card is refused with the Vietnamese prefix message; adding `admin.example.vn` under the storefront card is refused too.

- [ ] **Step 6: Verify and commit**

```bash
pnpm turbo lint typecheck --filter=@booking/dashboard
git add apps/dashboard/app
git commit -m "feat(dashboard): manage storefront and console domains separately in tenant settings"
```

---

### Task 7: Dashboard resolves its tenant from the Host header

The core change. Resolution runs in root middleware and publishes through AsyncLocalStorage, which is what lets `requireTenant()` keep its signature and leaves all 65 call sites alone.

**Files:**
- Create: `apps/dashboard/app/lib/tenant-host.server.ts`
- Modify: `apps/dashboard/app/lib/api.server.ts`
- Modify: `apps/dashboard/app/lib/request-auth.server.ts`
- Modify: `apps/dashboard/app/lib/auth-middleware.server.ts`
- Modify: `apps/dashboard/app/lib/workspace.ts`
- Modify: `apps/dashboard/app/features/tenant/server/tenant.server.ts`
- Modify: `apps/dashboard/app/features/partner/server/partner.server.ts`
- Modify: `apps/dashboard/app/features/affiliate/server/affiliate.server.ts`
- Modify: `apps/dashboard/app/features/admin/server/admin.server.ts`
- Modify: `apps/dashboard/app/constants/api-paths.ts`

**Interfaces:**
- Consumes: `PublicTenantResponse.adminHostname`, `ScopeMembership.adminHostname` (Task 5); `apiPaths.public.tenant` already exists in the storefront's path module and gains a dashboard twin here.
- Produces:
  - `resolveDashboardHost(request: Request): Promise<DashboardHostResolution>` where
    `type DashboardHostResolution = { kind: 'platform' } | { kind: 'tenant'; tenant: AdminHostTenantResponse } | { kind: 'unknown-host' }`
  - `getCurrentDashboardHost(): DashboardHostResolution`
  - `getCurrentHostTenant(): AdminHostTenantResponse` (throws outside a tenant host)
  - `tenantMembership(info, tenantId): TenantMembership | null` and `partnerMembershipIn(info, tenantId): PartnerMembership | null` in `workspace.ts`
  - Guard return types unchanged: `TenantContext`, `PartnerContext`, `PlatformContext`, `AffiliateAreaContext`

- [ ] **Step 1: Add the API endpoint and the resolver**

Add to `apps/dashboard/app/constants/api-paths.ts`, in the public group:

```ts
    adminTenant: '/public/admin-tenant',
```

Create `apps/dashboard/app/lib/tenant-host.server.ts`:

```ts
import { adminHostTenantResponseSchema, type AdminHostTenantResponse } from '@booking/contracts';
import { apiGet } from './api.server';
import { apiPaths } from '~/constants/api-paths';

export type DashboardHostResolution =
  | { kind: 'platform' }
  | { kind: 'tenant'; tenant: AdminHostTenantResponse }
  | { kind: 'unknown-host' };

/**
 * Host header → hostname. Mirrors the API's canonical parser
 * (`apps/api/src/shared/http/hostname.ts`) and the storefront's copy: first
 * forwarded hop, IPv6 literal unwrapped, port dropped, trailing FQDN dot dropped.
 * The bracket branch returns early — stripping a `:port` off an unwrapped IPv6
 * literal would eat its last group.
 */
export function requestHostname(request: Request): string {
  const hostPort = (request.headers.get('host')?.split(',')[0] ?? '').trim().toLowerCase();
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    return end === -1 ? '' : hostPort.slice(1, end);
  }
  return (hostPort.split(':')[0] ?? '').replace(/\.$/, '');
}

/**
 * The platform console: the configured DASHBOARD_HOST, a single-label host
 * (`localhost`, a container name), or a bare IP literal. These serve `/admin`
 * without asking the API, exactly as the storefront short-circuits its landing.
 */
function isPlatformHostname(hostname: string): boolean {
  const configured = process.env.DASHBOARD_HOST?.trim().toLowerCase();
  return (
    (configured ? hostname === configured : false) ||
    !hostname.includes('.') ||
    /^[\d.]+$/.test(hostname)
  );
}

export async function resolveDashboardHost(request: Request): Promise<DashboardHostResolution> {
  const hostname = requestHostname(request);
  if (hostname && isPlatformHostname(hostname)) return { kind: 'platform' };

  const result = await apiPublicGet<AdminHostTenantResponse>(apiPaths.public.adminTenant, {
    schema: adminHostTenantResponseSchema,
    headers: { 'x-forwarded-host': hostname },
    signal: request.signal,
  });
  if (result.ok && result.data) return { kind: 'tenant', tenant: result.data };
  if (result.status === 404) return { kind: 'unknown-host' };
  throw new Response('Không phân giải được tên miền quản trị.', { status: 503 });
}
```

`GET /public/admin-tenant` is `@Public()` and runs before any session exists, so it cannot go through
the bearer-token `apiGet`. Add the unauthenticated wrapper to `apps/dashboard/app/lib/api.server.ts`
beside the others — the underlying client already has it, the dashboard just never needed it:

```ts
/** Unauthenticated read, for the `@Public()` endpoints the BFF calls before login. */
export function apiPublicGet<T>(path: string, options?: ApiRequestOptions<T>) {
  return client().publicGet<T>(path, options);
}
```

- [ ] **Step 2: Add the backing endpoint and contract**

In `packages/contracts/src/contracts/tenancy.ts`:

```ts
/** `GET /public/admin-tenant` — the dashboard BFF resolving its Host to a tenant. */
export const adminHostTenantResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  branding: dashboardBrandConfigSchema.nullable(),
  /** Shows a renewal banner; the console stays usable so the tenant can pay. */
  subscriptionExpired: z.boolean(),
  /** Locks the console behind a 403 — unlike an expiry, this is not self-serve. */
  suspended: z.boolean(),
});
export type AdminHostTenantResponse = z.infer<typeof adminHostTenantResponseSchema>;
```

In `apps/api/src/modules/tenancy/infrastructure/http/public-tenant.controller.ts`, add a second route beside `tenant()`, injecting `ResolveTenantByAdminHostUseCase` from Task 2:

```ts
  @Public()
  @Get('admin-tenant')
  @ApiOperation({ summary: 'Resolve the tenant for a dashboard Host' })
  @ApiOkResponse({ type: AdminHostTenantResponseDto })
  async adminTenant(
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<AdminHostTenantResponse> {
    const resolvedHost = forwardedHost?.split(',')[0]?.trim() || host;
    if (!resolvedHost) {
      throw new MissingTenantHost();
    }
    return this.resolveAdmin.execute(resolvedHost);
  }
```

Add `AdminHostTenantResponseDto` to `dto/tenancy.dto.ts`, following the shape of `PublicTenantResponseDto`.

- [ ] **Step 3: Confirm the host header stays scoped to resolution**

Only `resolveDashboardHost` forwards the visitor's host; the authenticated wrappers are deliberately
left alone, because dashboard calls name their scope with `x-tenant-id` and
`ResolveLegalCallerScopeUseCase` documents why that is the primary input rather than the Host.

```bash
rg -n "x-forwarded-host" apps/dashboard/app
```

Expected: exactly one hit, inside `tenant-host.server.ts`.

- [ ] **Step 4: Carry the host resolution in the request context**

In `request-auth.server.ts`, add the host to the state and expose two readers:

```ts
export interface DashboardRequestAuthState {
  auth: DashboardAuthContext | null;
  host: DashboardHostResolution;
  suppressSessionCommit: boolean;
}
```

```ts
export function getCurrentDashboardHost(): DashboardHostResolution {
  const state = requestAuthStorage.getStore();
  if (!state) throw new Error('No Dashboard request auth scope is active.');
  return state.host;
}

export function getCurrentHostTenant(): AdminHostTenantResponse {
  const host = getCurrentDashboardHost();
  if (host.kind !== 'tenant') {
    throw new Error('Host tenant accessed outside a tenant-host request');
  }
  return host.tenant;
}
```

Import the types with `import type` so this browser-reachable module never pulls a `.server` runtime.

- [ ] **Step 5: Resolve the host first in the middleware**

In `auth-middleware.server.ts`, resolve before anything else and thread it into every `runWithDashboardRequestAuth` call — there are four:

```ts
  return async ({ request, url = new URL(request.url) }, next) => {
    const host = await resolveDashboardHost(request);
    if (host.kind === 'unknown-host') {
      throw new Response('Không tìm thấy không gian quản trị cho tên miền này.', {
        status: 404,
        statusText: 'Unknown dashboard host',
      });
    }
    // A suspension is answered explicitly rather than as a 404: the caller typed
    // this hostname, so hiding the reason only makes it look like a broken domain.
    if (host.kind === 'tenant' && host.tenant.suspended) {
      throw new Response(`${host.tenant.name} đang bị tạm ngưng. Vui lòng liên hệ BookingOS.`, {
        status: 403,
        statusText: 'Tenant suspended',
      });
    }

    if (isLoginMutation(request, url)) {
      return runWithDashboardRequestAuth({ auth: null, host, suppressSessionCommit: false }, next);
    }
    // …every other runWithDashboardRequestAuth call gains `host` the same way
```

- [ ] **Step 6: Replace first-match membership lookup**

In `workspace.ts`, keep `firstTenantMembership` / `firstPartnerMembership` for the platform-host workspaces directory, and add the two lookups the guards need:

```ts
export function tenantMembership(
  info: SessionInfoResponse,
  tenantId: string,
): TenantMembership | null {
  const tenant = info.scopes.find(
    (item): item is TenantMembership => item.scope === 'tenant' && item.tenantId === tenantId,
  );
  return tenant ?? null;
}

export function partnerMembershipIn(
  info: SessionInfoResponse,
  tenantId: string,
): PartnerMembership | null {
  const partner = info.scopes.find(
    (item): item is PartnerMembership =>
      item.scope === 'partner' && item.tenantId === tenantId && Boolean(item.partnerId),
  );
  return partner ?? null;
}

export function tenantMemberships(info: SessionInfoResponse): TenantMembership[] {
  return info.scopes.filter(
    (item): item is TenantMembership => item.scope === 'tenant' && Boolean(item.tenantId),
  );
}

export function partnerMemberships(info: SessionInfoResponse): PartnerMembership[] {
  return info.scopes.filter(
    (item): item is PartnerMembership =>
      item.scope === 'partner' && Boolean(item.tenantId) && Boolean(item.partnerId),
  );
}
```

- [ ] **Step 7: Bind the tenant guard to the host**

Replace the body of `requireTenant` in `features/tenant/server/tenant.server.ts`. The signature does not change:

```ts
export async function requireTenant(request: Request, permission?: string): Promise<TenantContext> {
  const ctx = await requireScope(request, 'tenant');
  // The host names the tenant; the session proves the caller may act in it. Never
  // the first membership — that is what limited a multi-tenant operator to one.
  const hostTenant = getCurrentHostTenant();
  const membership = tenantMembership(ctx.info, hostTenant.id);
  if (!membership) {
    throw new Response(`Tài khoản này không có quyền tại ${hostTenant.name}.`, { status: 403 });
  }
  const tenantId = hostTenant.id;
  if (permission && !membership.permissions.includes(permission)) {
    throw new Response(`Bạn không có quyền truy cập (${permission}).`, { status: 403 });
  }

  return {
    ctx,
    membership,
    tenantId,
    auth: { token: ctx.user.accessToken, tenantId },
    can: (key) => membership.permissions.includes(key),
  };
}
```

- [ ] **Step 8: Bind the partner guard to the host's tenant**

In `features/partner/server/partner.server.ts`, replace `firstPartnerMembership(ctx.info)` with the host-scoped lookup:

```ts
  const hostTenant = getCurrentHostTenant();
  const membership = partnerMembershipIn(ctx.info, hostTenant.id);
  if (!membership) {
    throw new Response(`Tài khoản này không có đối tác nào tại ${hostTenant.name}.`, {
      status: 404,
    });
  }
```

The rest of the function is unchanged.

- [ ] **Step 9: Bind the affiliate area to the host's tenant**

In `features/affiliate/server/affiliate.server.ts`, drop the `?tenant=` selector and update the docblock, since the host now decides:

```ts
  const hostTenant = getCurrentHostTenant();
  const active =
    approved.find((membership) => membership.tenantId === hostTenant.id) ?? null;
```

Delete the `const requested = new URL(request.url).searchParams.get('tenant');` line and its use.

- [ ] **Step 10: Keep the platform guard on the platform host**

In `features/admin/server/admin.server.ts`, before resolving the membership:

```ts
  if (getCurrentDashboardHost().kind !== 'platform') {
    throw new Response('Không tìm thấy trang.', { status: 404 });
  }
```

- [ ] **Step 11: Verify**

```bash
pnpm turbo lint typecheck --filter=@booking/dashboard --filter=@booking/api --filter=@booking/contracts
```

Expected: pass. If a `requireTenant` call site errors, the AsyncLocalStorage threading in Step 4 is wrong — the signature must not have changed.

- [ ] **Step 12: Commit**

```bash
git add apps/dashboard/app apps/api/src packages/contracts
git commit -m "feat(dashboard): resolve the tenant from the Host header"
```

---

### Task 8: Area gating, workspaces directory and host-driven brand

**Files:**
- Modify: `apps/dashboard/app/root.tsx`
- Modify: `apps/dashboard/app/lib/tenant-brand.ts`
- Modify: `apps/dashboard/app/lib/navigation.ts:82-113`
- Modify: `apps/dashboard/app/components/app-sidebar.tsx`
- Modify: `apps/dashboard/app/routes/workspaces.tsx`
- Modify: `apps/dashboard/app/routes/home.tsx`
- Modify: `apps/dashboard/CLAUDE.md:73-86`

**Interfaces:**
- Consumes: `getCurrentDashboardHost`, `getCurrentHostTenant`, `tenantMemberships`, `partnerMemberships` (Task 7); `ScopeMembership.adminHostname` (Task 5).
- Produces: root loader returns `{ info, host }` where `host` is the `DashboardHostResolution`; `dashboardAreasFor(info, host)` replaces the `pathname` parameter; `tenantBrandCss(theme)` keeps its signature and `activeTenantMembership` is deleted.

- [ ] **Step 1: Return the host from the root loader**

In `root.tsx`:

```ts
export async function loader({ request }: Route.LoaderArgs) {
  const info = await loadSessionInfo(request);
  return {
    info,
    host: getCurrentDashboardHost(),
    // The workspaces directory lives on the platform console, which is a different
    // origin from a tenant host — and a component may never read process.env.
    platformConsoleUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
  };
}
```

- [ ] **Step 2: Take the brand from the host, not from a scope guess**

Delete `activeTenantMembership` from `lib/tenant-brand.ts` and its import in `root.tsx` and `app-sidebar.tsx`. `tenantBrandCss` is unchanged. In the `App` component:

```ts
  const host = loaderData?.host ?? { kind: 'platform' as const };
  const hostTenant = host.kind === 'tenant' ? host.tenant : null;
  const brandCss = tenantBrandCss(hostTenant?.branding ?? null);
```

Render `brandCss` before the shell exactly as today. Because the host is known before authentication, move the `brandCss` emission **above** the `if (!info) return <Outlet />` early return so the sign-in screen is branded too.

- [ ] **Step 3: Gate areas by host in the sidebar**

In `lib/navigation.ts`, change the signature and pick areas from the host:

```ts
export function dashboardAreasFor(
  info: SessionInfoResponse,
  host: DashboardHostResolution,
): DashboardArea[] {
  const areas: DashboardArea[] = [];

  if (host.kind === 'platform') {
    const platform = info.scopes.find((membership) => membership.scope === 'platform');
    if (platform) {
      areas.push(
        scopedArea(DASHBOARD_AREAS[0]!, adminNavSections, platform.permissions, {
          title: DASHBOARD_AREAS[0]!.title,
          basePath: dashboardPaths.admin.home,
        }),
      );
    }
    return areas;
  }

  const tenant = tenantMembership(info, host.tenant.id);
  if (tenant) {
    areas.push(
      scopedArea(DASHBOARD_AREAS[1]!, tenantNavSections, tenant.permissions, {
        title: tenant.tenantName ?? host.tenant.name,
        basePath: dashboardPaths.tenant.home,
      }),
    );
  }

  const partner = partnerMembershipIn(info, host.tenant.id);
  if (partner) {
    areas.push(
      scopedArea(DASHBOARD_AREAS[2]!, partnerNavSections, partner.permissions, {
        title: partner.partnerName ?? 'Partner',
        basePath: dashboardPaths.partner.home,
      }),
    );
  }

  return areas;
}
```

Update the `AppSidebar` call to `dashboardAreasFor(info, host)`, passing `host` down as a new prop from `root.tsx`. Replace the sidebar's `membership`-derived header values with the host tenant: `workspaceName` becomes `hostTenant?.name ?? 'BookingOS'` and `appIconUrl` reads `hostTenant?.branding?.faviconUrl || hostTenant?.branding?.logoUrl || null`.

- [ ] **Step 4: Show the renewal banner on an expired subscription**

`AdminHostTenantResponse.subscriptionExpired` is what keeps a lapsed tenant able to pay. Render it in
`root.tsx`, inside the shell and above `<Outlet />`, so it appears on every console screen:

```tsx
{hostTenant?.subscriptionExpired ? (
  <div
    role="status"
    className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-foreground lg:px-6"
  >
    Gói dịch vụ đã hết hạn. Một số thao tác bị khoá cho đến khi bạn gia hạn.
  </div>
) : null}
```

It is a banner and not a block on purpose — `toSubscriptionStatusResponse` already reports
`dashboardReadOnly`, and the backend enforces it. Duplicating that as a hard gate here would lock the
tenant out of the screens where they renew.

- [ ] **Step 5: Replace the workspace-switch link with a cross-host directory**

In `app-sidebar.tsx`, the "Đổi workspace" group currently appears when the session has more than one
tenant/partner scope. Keep that condition but point it at the platform console, since `/workspaces` no
longer lives on a tenant host. A component must never read `process.env`, so return the origin from
the root loader and pass it down as a prop:

`platformConsoleUrl` already comes from the root loader (Step 1); pass it into `AppSidebar` as a prop
alongside `info` and `host`.

```tsx
<SidebarMenuButton asChild tooltip="Đổi không gian làm việc">
  <a href={`${platformConsoleUrl}/workspaces`}>
    <PanelsTopLeft />
    <span>Đổi workspace</span>
  </a>
</SidebarMenuButton>
```

It becomes an `<a>` rather than a `<Link>`: this navigates to a different origin, which the router
cannot handle client-side.

In `routes/workspaces.tsx`, list every membership and link out by hostname:

```ts
export async function loader({ request }: Route.LoaderArgs) {
  if (getCurrentDashboardHost().kind !== 'platform') {
    throw new Response('Không tìm thấy trang.', { status: 404 });
  }
  const { info } = await requireSessionInfo(request);
  return { tenants: tenantMemberships(info), partners: partnerMemberships(info) };
}
```

Each card's link becomes an absolute `href` built from the membership's `adminHostname` — `https://<adminHostname>` in production, `http://<adminHostname>:<DASHBOARD_PORT>` when the hostname ends in `.localhost`, mirroring the API's `storefrontUrl()` helper. A membership with a null `adminHostname` renders disabled with the copy "Chưa cấu hình tên miền quản trị".

- [ ] **Step 6: Send stray area paths to the directory**

`routes/home.tsx` is the index route. On the platform host it should send an authenticated caller to `/admin` if they hold platform scope and to `/workspaces` otherwise; on a tenant host it keeps sending them to their default area. Add the same guard to the top of the `_layout.tsx` loaders for `tenant`, `partner` and `affiliate`:

```ts
  if (getCurrentDashboardHost().kind === 'platform') {
    throw (await getOptionalUser(request))
      ? redirect(dashboardPaths.workspaces)
      : new Response('Không tìm thấy trang.', { status: 404 });
  }
```

The anonymous branch 404s rather than redirecting, so the directory can never be used to probe which areas exist.

- [ ] **Step 7: Correct the CLAUDE.md note about the sign-in screen**

`apps/dashboard/CLAUDE.md:80-82` states the sign-in screen "renders *before* a tenant is known, so it cannot inherit a brand from the session". That is no longer true. Replace those sentences with:

```markdown
`app.css` holds exactly two scopes, both for the sign-in screen (`.auth-brand-panel`,
`.auth-form-panel`). On a tenant console host the tenant is resolved from the Host header *before*
authentication, so these panels do inherit the tenant brand through `tenantBrandCss()` in
`root.tsx`; on the platform host they fall back to the BookingOS default. They are not a second
design system, and nothing else in the app should acquire one.
```

Also update the "Data & auth" paragraph to say the root middleware resolves the Host to a tenant before authenticating.

- [ ] **Step 8: Verify in the running app**

```bash
pnpm dev
```

Confirm each of these:
- `admin.bookingstudio.localhost:5174` shows the BookingStudio brand on the **login** screen.
- After signing in as `owner@bookingstudio.vn`, the sidebar shows only Tenant (and Partner if applicable) — no Platform Admin group.
- `admin.bookingstudio.localhost:5174/admin` returns 404.
- `localhost:5174/tenant` redirects to `/workspaces` when signed in, and 404s when signed out.
- `localhost:5174` signed in as `admin@bookingos.local` lands on `/admin`.
- `admin.nosuchtenant.localhost:5174` returns the 404 unknown-host page.
- **Sessions are per host, as designed.** Signed in at `admin.bookingstudio.localhost:5174`, open
  `admin.bookingstad.localhost:5174` and confirm it asks for a login rather than carrying the session
  across. The `__dashboard_session` cookie sets no `domain`, so this needs no code — but it is the
  behaviour the design chose deliberately, and a regression here would be silent.

- [ ] **Step 9: Verify and commit**

```bash
pnpm check:frontend-structure && pnpm turbo lint typecheck --filter=@booking/dashboard
git add apps/dashboard
git commit -m "feat(dashboard): gate areas by host and brand the shell from it"
```

---

### Task 9: Storefront links and email CTAs point at the tenant's console

**Files:**
- Modify: `apps/storefront/app/features/partner-onboarding/server/partner-registration-start-route.server.ts:33`
- Modify: `apps/storefront/app/features/partner-onboarding/server/partner-done-route.server.ts`
- Modify: `apps/storefront/app/features/affiliate/server/affiliate-application-route.server.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts`

**Interfaces:**
- Consumes: `PublicTenantResponse.adminHostname` (Task 5); `getCurrentStorefrontTenant()` already exists at `apps/storefront/app/lib/server/request-context.server.ts:34`.
- Produces: `tenantDashboardOrigin(tenant: StorefrontTenant): string` exported from `apps/storefront/app/lib/server/tenant.server.ts`; `EmailBrand.dashboardUrl` becomes tenant-resolved.

- [ ] **Step 1: Add the storefront-side origin helper**

Append to `apps/storefront/app/lib/server/tenant.server.ts`:

```ts
/**
 * Where this tenant's operators sign in. `/partner` and `/tenant` exist only on a
 * tenant console host, so a partner sent to the platform console would land on a
 * 404. Falls back to the platform console for a tenant with no verified dashboard
 * domain, which is the only place left that can tell them what to do.
 */
export function tenantDashboardOrigin(tenant: StorefrontTenant): string {
  if (!tenant.adminHostname) return storefrontEnv.dashboardUrl;
  if (tenant.adminHostname.endsWith('.localhost')) {
    return `http://${tenant.adminHostname}:${process.env.DASHBOARD_PORT ?? '5174'}`;
  }
  return `https://${tenant.adminHostname}`;
}
```

- [ ] **Step 2: Fix the partner-registration redirect**

In `partner-registration-start-route.server.ts:33`, the tenant is already in scope from line 30:

```ts
    if (entry === 'dashboard') {
      return redirect(`${tenantDashboardOrigin(tenant)}/partner`);
    }
```

- [ ] **Step 3: Fix the partner-done link**

`partner-done-route.server.ts` returns `dashboardUrl: storefrontEnv.dashboardUrl` for `PartnerDonePage`. Replace it:

```ts
    dashboardUrl: tenantDashboardOrigin(getCurrentStorefrontTenant()),
```

`partner-done-page.tsx` needs no change — it already renders `${dashboardUrl}/auth/login`.

- [ ] **Step 4: Fix the affiliate application link**

`affiliate-application-route.server.ts` returns `dashboardUrl: storefrontEnv.dashboardUrl`, consumed by `use-affiliate-application-page-controller.ts` as `${loaderData.dashboardUrl}/auth/login`. Replace the loader value the same way:

```ts
    dashboardUrl: tenantDashboardOrigin(getCurrentStorefrontTenant()),
```

- [ ] **Step 5: Leave the platform landing alone**

`platform-header.tsx` and `sections/platform-footer.tsx` read `dashboardLoginUrl` from `root-loader.server.ts:62`, which is only built on the `kind: 'platform'` payload — the BookingOS landing pointing at the platform console. That is correct. Confirm nothing else changed:

```bash
rg -n "storefrontEnv.dashboardUrl" apps/storefront/app
```

Expected: two hits — `root-loader.server.ts` and the fallback inside `tenantDashboardOrigin`.

- [ ] **Step 6: Resolve the email CTA host per tenant**

In `prisma-notification.reader.ts`, add a second sub-select to each of the four brand queries, beside the `primary_hostname` one fixed in Task 3:

```sql
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'dashboard'
              LIMIT 1) AS admin_hostname
```

Add `admin_hostname: string | null` to `TenantBrandRow` and to the two inline row types on `loadListingContext` and `loadPartnerContext`. Add the helper beside `storefrontUrl`:

```ts
  /**
   * Mirrors {@link storefrontUrl}. Partner CTAs point at /partner/*, which lives
   * only on a tenant console host — the platform console does not serve it.
   */
  private dashboardUrl(hostname: string | null): string {
    if (!hostname) return process.env.DASHBOARD_URL ?? 'http://localhost:5174';
    if (hostname.endsWith('.localhost')) {
      return `http://${hostname}:${process.env.DASHBOARD_PORT ?? '5174'}`;
    }
    return `https://${hostname}`;
  }
```

In `toBrand`, replace `dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174'` with `dashboardUrl: this.dashboardUrl(row.admin_hostname)`. The tenant-less `loadBrand()` branch keeps the env value — it has no tenant to resolve.

Update the two `this.toBrand({...})` literal call sites (in `loadBookingContext`) to pass `admin_hostname: row.admin_hostname`.

The five CTA builders — `booking-notification-data.ts`, `dispatch-listing-event.use-case.ts`, `dispatch-tax-certificate-event.use-case.ts` and the two in `dispatch-partner-event.use-case.ts` — need no change; they read `brand.dashboardUrl`.

- [ ] **Step 7: Verify in the running app**

With `pnpm dev` up, trigger a partner-facing notification (approve a pending listing in the BookingStudio tenant console) and open Mailpit at `localhost:8025`. The CTA must point at `admin.bookingstudio.stg.bookingos.vn` — the seeded **primary** dashboard host. That mirrors the existing `storefrontUrl()` behaviour, where the primary is also the staging host; it is a pre-existing quirk of the seed, not a regression, and it is why the `.localhost` branch exists for deployments whose primary is a local host.

- [ ] **Step 8: Verify and commit**

```bash
pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck --filter=@booking/storefront --filter=@booking/api
git add apps/storefront/app apps/api/src
git commit -m "feat: point partner and affiliate links at each tenant's console host"
```

---

### Task 10: Ingress, deployment config and documentation

**Files:**
- Modify: `docker/caddy/Caddyfile:89-95`
- Modify: `docker-compose.deploy.yml` (the `dashboard` service environment)
- Modify: `.env.example`
- Modify: `AGENTS.md` (Layout and Local run recipe sections)
- Modify: `docs/architecture.md`, `docs/deployment.md`
- Create: `docs/features/dashboard-hosts.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code exports. `DASHBOARD_HOST` becomes a variable the dashboard container reads (Caddy already receives it).

- [ ] **Step 1: Route `admin.*` to the dashboard**

Replace the catch-all block at `docker/caddy/Caddyfile:89-95`:

```
# THE DEFAULT ROUTE — deliberately last and catch-all, for EVERY other hostname:
# tenant storefront subdomains, tenant custom domains, and tenant CONSOLE hosts.
#
# The console split rides on a reserved first label rather than a per-tenant site
# block, because naming hostnames here would make every tenant onboarding a deploy —
# the same reason the storefront route is a catch-all. Caddy cannot ask the API which
# upstream a hostname wants (the on-demand `ask` hook only answers whether a
# certificate may be issued), so the prefix is what makes the decision static.
# `AddDomainUseCase` enforces both halves of the rule: a dashboard domain must start
# with `admin.`, and a storefront domain must not.
https:// {
	import common
	tls {
		on_demand
	}
	@dashboard header_regexp Host ^admin\.
	handle @dashboard {
		reverse_proxy dashboard:3000
	}
	handle {
		reverse_proxy storefront:3000
	}
}
```

- [ ] **Step 2: Validate the Caddy config**

```bash
docker compose --env-file .env.stg -f docker-compose.deploy.yml \
  run --rm --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile
```

Expected: `Valid configuration`. This is the check `Caddyfile:20-24` already requires; on-demand and matcher syntax have moved between Caddy 2.x releases, so do not skip it.

- [ ] **Step 3: Give the dashboard container its own host name**

In `docker-compose.deploy.yml`, the `dashboard` service needs `DASHBOARD_HOST` so `isPlatformHostname` can recognise the platform console. Add it beside the existing `STOREFRONT_URL`:

```yaml
      DASHBOARD_HOST: ${DASHBOARD_HOST:?DASHBOARD_HOST is required}
```

- [ ] **Step 4: Document the local variables**

In `.env.example`, add `DASHBOARD_HOST` with the local value and a comment:

```
# The platform console host. Anything else that reaches the dashboard is resolved
# as a tenant console host against tenant_domains (kind = dashboard).
DASHBOARD_HOST=localhost
```

- [ ] **Step 5: Write the feature doc**

Create `docs/features/dashboard-hosts.md` covering: the `kind` discriminator and the widened primary index; the reserved `admin.` prefix and why it is a routing contract rather than a preference; the two resolution use-cases and why the storefront one must filter; the deliberate difference in `live` semantics (an expired subscription reaches the console, a suspended tenant does not); which areas live on which host; the per-host session model; and the five primary-domain reads that must stay kind-scoped. Link it from the `docs/features/` list in `AGENTS.md`.

- [ ] **Step 6: Update the run recipe and layout notes**

In `AGENTS.md`, the Layout table describes the dashboard as `/admin /tenant /partner /affiliate` on port 5174. Change it to note that `/admin` is served on the platform host and the other three on a tenant console host. In "Local run recipe", add the console hosts beside the existing storefront hosts, and extend the two-demo-tenants table with an `admin.` column.

- [ ] **Step 7: Update architecture and deployment docs**

In `docs/architecture.md`, extend the request-flow section covering Host→tenant resolution to describe both surfaces. In `docs/deployment.md`, document the Caddy matcher and the fact that a tenant console custom domain follows the same TXT + on-demand-TLS path as a storefront one, with the added prefix rule.

- [ ] **Step 8: Run the full static check**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build \
  && pnpm --filter=@booking/api check:rls
```

Expected: every gate passes.

- [ ] **Step 9: End-to-end walk-through**

With `docker compose up -d` and `pnpm dev`, confirm the full list from the spec's Verification section: branded login at `admin.bookingstudio.localhost:5174`; `/admin` 404 there and `/tenant` 404 on `localhost:5174`; the 403 for a user with no role in the host's tenant (sign in as `owner@bookingstad.vn` at `admin.bookingstudio.localhost:5174`); a non-`admin.` dashboard domain refused in tenant settings; a partner email CTA in Mailpit pointing at the tenant console; and an affiliate referral link in `/affiliate/links` still pointing at the storefront host.

- [ ] **Step 10: Commit**

```bash
git add docker/caddy/Caddyfile docker-compose.deploy.yml .env.example AGENTS.md docs
git commit -m "feat(ops): route admin.* hosts to the dashboard and document the split"
```

---

## Rollout Note

Tasks 1-5 are backward compatible: the column defaults to `storefront`, the backfill adds hosts nobody routes to yet, and no user-visible behaviour changes. The cut-over is Task 10 Step 1 — the moment Caddy starts routing `admin.*` to the dashboard container. Deploy Tasks 1-9 first, confirm the seeded console hosts resolve through `GET /public/admin-tenant`, then ship the Caddy change.
