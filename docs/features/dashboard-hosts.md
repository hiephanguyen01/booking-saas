# Dashboard host multi-tenancy (`admin.*`)

Before 2026-08, the dashboard resolved its scope **only from the login session** — one process, one
`DASHBOARD_URL`, and every tenant's operators signed into the same generic console. This feature gives
each tenant its own **console host** (`admin.<slug>.<domain>`), resolved from the `Host` header exactly
like the storefront already resolves a tenant from its own `Host`, and gates the platform-only `/admin`
area to the platform's own host. Built across ten tasks culminating 2026-08-12 (this task wired the
last piece: Caddy actually routing `admin.*` to the dashboard container — until then none of the
backend/frontend work below was reachable). Contract: `TenantDomainKind` in
[`packages/contracts/src/contracts/tenancy.ts`](../../packages/contracts/src/contracts/tenancy.ts).

## The `kind` discriminator and the widened primary index

`tenant_domains` gained a `kind` column (`apps/api/prisma/schema.prisma`):

```prisma
enum TenantDomainKind {
  storefront
  dashboard
}
```

Every hostname is *exactly one* of these — a tenant's shop and a tenant's console are different rows,
never a flag on one row. `hostname` stays globally unique (still `citext`), so the same host cannot
serve both.

Before this feature a tenant had **one** primary domain, full stop:

```sql
-- apps/api/prisma/migrations/20260724120000_entity_post_refactor_hardening/migration.sql
CREATE UNIQUE INDEX "tenant_domains_one_primary_per_tenant_key"
  ON "tenant_domains" ("tenant_id") WHERE "is_primary";
```

A tenant now needs **two** primaries at once — its storefront and its console — so the migration that
adds `kind` also widens this index by one column:

```sql
-- apps/api/prisma/migrations/20260812000000_tenant_domain_kind/migration.sql
DROP INDEX IF EXISTS "tenant_domains_one_primary_per_tenant_key";
CREATE UNIQUE INDEX "tenant_domains_one_primary_per_tenant_key"
  ON "tenant_domains" ("tenant_id", "kind") WHERE "is_primary";
```

`(tenant_id)` → `(tenant_id, kind)` is the whole change, and it is the reason every "read the primary
domain" call site had to be revisited (see below): a query that filtered only on `tenant_id` and
`is_primary` used to get one deterministic row back; after this migration it can get two, and which one
comes back first depends on ordering nobody promised. The same migration backfills a verified, primary
`admin.<existing storefront hostname>` row for every tenant that already had a verified primary
storefront domain, so no tenant goes live without a console host.

`PrismaTenantDomainRepository.setPrimary` (`apps/api/src/modules/tenancy/infrastructure/repositories/prisma-tenant-domain.repository.ts`)
loads the target domain first and clears `isPrimary` only for rows of **the same `kind`** — clearing by
`tenant_id` alone would silently demote the other surface's primary, and the partial index (scoped to
`(tenant_id, kind)`) would not catch it because that demotion never collides with anything.

## The reserved `admin.` prefix is a routing contract, not a preference

`AddDomainUseCase` (`apps/api/src/modules/tenancy/application/use-cases/add-domain.use-case.ts`) enforces
a symmetric rule, both directions:

- `kind: 'dashboard'` and the hostname does **not** start with `admin.` → `AdminDomainPrefixRequired` (400).
- `kind: 'storefront'` and the hostname **does** start with `admin.` → `AdminPrefixReserved` (400).

The reason it has to be a hard prefix rule enforced at write time — not a per-tenant Caddy site, not a
lookup Caddy performs at request time — is that Caddy has no way to ask "which app does this hostname
belong to." Its `on_demand_tls` `ask` hook (`docker/caddy/Caddyfile`) only ever answers *whether a
certificate may be issued* for a hostname, never *which upstream should serve it*. So the split has to
be decidable from the string alone, with nothing dynamic in the loop — which is exactly what a reserved
first label buys: `docker/caddy/Caddyfile`'s catch-all block matches
`@dashboard header_regexp Host (?i)^admin\.` and routes to `dashboard:3000`, everything else in the same
block to `storefront:3000`. Naming hostnames in Caddy config instead (a per-tenant site block) would
make every tenant's console onboarding a deploy, the same reason the storefront route has always been a
catch-all rather than an enumerated list.

The `(?i)` on that matcher is load-bearing, not defensive: `Host` is case-insensitive per RFC 9110 and
`hostnameSchema` lowercases every hostname before it is stored (the column is also `citext`), but
Caddy's `header_regexp` is a case-sensitive Go RE2 match. Drop the flag and a request carrying
`Host: ADMIN.tenant.vn` routes to the storefront while the database is certain that hostname is a
console host — the two halves of the routing contract disagreeing about the same string, silently.

## Two resolution use-cases, and why the storefront one must filter by `kind`

Both call sites share one Redis-backed host cache (`ITenantCache`,
`apps/api/src/modules/tenancy/domain/ports/tenant-cache.port.ts`, key `host:v2:<hostname>`, storing
`<tenantId>:<kind>`) sitting in front of one query, `TenantDomainRepository.findByHostname`. That query
does not filter by kind — it can't, `hostname` is unique, so there is exactly one row for any given
string — which pushes the kind check into each use-case:

- **Dashboard**: `ResolveTenantByAdminHostUseCase`
  (`apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-admin-host.use-case.ts`),
  behind `GET /public/admin-tenant`. Rejects (`UnknownTenantHost`, 404) unless `cached.kind === 'dashboard'`.
- **Storefront**: `ResolveTenantByHostUseCase`
  (`apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts`), behind
  `GET /public/tenant`. Rejects unless `cached.kind === 'storefront'`.

The storefront's guard is the one that actually matters for safety, and its own comment says so: *"A
dashboard hostname is not a storefront. [Many] modules resolve a tenant through this use-case; without
this guard an admin host would read as a valid storefront everywhere from checkout to legal
documents."* Concretely: if `ResolveTenantByHostUseCase` skipped the kind check, browsing straight to a
tenant's `admin.<slug>.<domain>` on the storefront app (bypassing Caddy, or if Caddy's routing config
ever drifted from the database's idea of which hosts are which) would resolve that hostname to a real,
live tenant record and render its shop — checkout, legal-document gating and every other storefront
surface would treat a console hostname as a legitimate shop. The `admin.` prefix keeps a *browser* from
reaching the wrong app under normal operation; the `kind` filter is what keeps the *API* correct even if
that first line of defense is bypassed or misconfigured.

## `live` deliberately means something different on each host

Both resolution paths call the same `evaluateSubscription()`
(`apps/api/src/modules/tenancy/domain/subscription-status.ts`), but apply its result differently.

**Storefront** (`ResolveTenantByHostUseCase`):

```ts
const live = tenant.status === 'active' && evaluation.storefrontLive && tenant.legalReadyAt !== null;
```

Any lapse — `suspended`, `expired`, a subscription that has fallen out of `storefrontLive`, or unpublished
legal documents — takes the shop down and shows the suspended page. That is the storefront's whole job:
customers should never book against a tenant that isn't fully live.

**Console** (`ResolveTenantByAdminHostUseCase`):

```ts
subscriptionExpired: !evaluation.dashboardWritable,
// `=== 'suspended'`, NOT `!== 'active'` — see below.
suspended: tenant.status === 'suspended',
```

The console never gates *resolution* on subscription expiry — an expired subscription only flips
`subscriptionExpired`, which the dashboard shell renders as a non-blocking renewal banner, not a lockout.
The console locks out (403, via `dashboardAuthMiddleware`) **only** on `tenant.status === 'suspended'`,
deliberately written as an equality check against `suspended` rather than a negation of `active` — with
`TenantStatus` being `active | suspended | expired`, a `!== 'active'` test would also catch `expired`,
locking out precisely the tenant that most needs to reach the console: the one there to renew. The
use-case's own docblock states the reasoning: a lapsed subscription must still reach the console because
that is where it gets fixed, and locking a tenant out of the one screen that renews its subscription is
unrecoverable from inside the product. A *suspended* tenant, by contrast, is a platform decision the
tenant cannot undo on its own — that is the one case that earns a closed door — and even then the console
reports it explicitly rather than 404ing, because "not found" would make a deliberate suspension look
like a broken domain.

So: an expired subscription reaches the console (with a banner) but not the storefront (suspended page).
A suspended tenant reaches neither.

## Areas per host

| Area | Reachable on | Off-host anonymous | Off-host signed in |
| --- | --- | --- | --- |
| `/admin` | platform host only | 404 | 404 (no same-host destination on a tenant console) |
| `/tenant`, `/partner`, `/affiliate` | a tenant console host only | 404 | redirect to `/workspaces` |

"Platform host" is the configured `DASHBOARD_HOST`, a single-label host (`localhost`, a container name),
or a bare IP literal — `isPlatformHostname()` in `apps/dashboard/app/lib/tenant-host.server.ts`, checked
before any API call, mirroring how the storefront short-circuits its own platform landing. Anything else
resolves through `GET /public/admin-tenant`.

Each area's own guard (`requirePlatform` for `/admin`; `requireTenant`/`requirePartner`/`requireAffiliate`
for the other three, under `apps/dashboard/app/features/<area>/server/<area>.server.ts`) repeats this
host check rather than relying only on a shared layout — React Router runs a route and its ancestors'
loaders in one pass, so a child route's own auth check firing first (before a parent layout's 404) would
otherwise leak a flash of the wrong area. On a tenant console host, the three tenant-facing guards go
one step further and check the signed-in user actually holds a membership in *that host's* tenant,
403ing (`"Tài khoản này không có quyền tại <tenant>."`) when they don't — this is what makes signing in
as one tenant's owner at another tenant's console host a hard failure rather than a quiet cross-tenant
peek.

## Sessions are per-host by cookie scope, not by a host field on the session

The Redis-backed session record (`apps/dashboard/app/lib/session-store.server.ts`) holds only
`{ accessToken, refreshToken, userId }` — no tenant or host. The backend session token itself proves
identity and carries **every** scope the user holds (platform + every tenant + every partner
membership); it is not minted per host. What actually confines a session to one host is simpler and
lower-level: the cookie (`createCookie('__dashboard_session', …)` in `apps/dashboard/app/lib/session.server.ts`)
sets no `domain` attribute, so the browser treats it as **host-only** — it is sent back exclusively to
the exact hostname that set it. A cookie minted while signed in at `admin.bookingstudio.vn` is simply
never presented to `admin.bookingstad.vn` or to the platform host; those are different origins as far as
the browser is concerned, regardless of what the underlying backend token would actually authorize.

Two consequences fall out of this:

- Moving between consoles is a **full navigation**, not a client-side route change — the "Đổi workspace"
  switcher and the `/workspaces` directory render plain `<a href>` links to the other host's absolute
  origin, because the client-side router cannot navigate across origins and, even if it tried, the
  existing cookie would not travel with it.
- Authorization is enforced **per request, per host** (the area guards in the previous section), not
  once at session creation — which is what makes it safe for one session token to carry every scope: the
  guard, not the session, decides whether *this* host may see *this* user's *this* membership.

**This means switching consoles re-authenticates** — following an "Đổi workspace"/`/workspaces` link
to another tenant's console host lands the browser there with no cookie at all, so it re-runs the login
flow (the backend session token is still valid and still carries the membership; only the host-only
cookie has to be re-set). This is by design, not a gap to "fix" later: do not widen the cookie's
`domain` attribute to make switching consoles cookie-less. A shared `domain` would leak the session
cookie to a **custom domain** tenant too — `admin.mycompany.vn` is a different site entirely from
`*.bookingos.vn`, and a cookie scoped broader than exact-host-match would ship to hosts BookingOS does
not control the DNS or TLS for, silently breaking the isolation this whole feature exists to provide.

## The primary-domain reads that must stay kind-scoped

Once a tenant could have two primary domains, every existing "read the primary domain" call site had to
start filtering by `kind` explicitly — `isPrimary: true` alone is no longer enough to pick one row
deterministically. The five load-bearing ones:

1. **Admin "view storefront" link** — `GetTenantDetailUseCase`
   (`apps/api/src/modules/tenancy/application/use-cases/get-tenant-detail.use-case.ts`):
   `domains.find((d) => d.isPrimary && d.kind === 'storefront')`, rendered as the "Mở storefront" link on
   the platform admin's tenant detail page.
2. **Affiliate referral links** — `PrismaAffiliateRepository`
   (`apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate.repository.ts`) queries
   `domains: { where: { isPrimary: true, kind: 'storefront' }, … }` with an explicit comment: a referral
   link must land a visitor on the shop, never on the console.
3. **Transactional email hostnames** — `PrismaNotificationReader`
   (`apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts`) resolves **two**
   kind-scoped sub-selects per brand lookup (`kind = 'storefront'` → `EmailBrand.storefrontUrl`,
   `kind = 'dashboard'` → `EmailBrand.dashboardUrl`), so every email CTA — booking confirmations, partner
   agreement notices, tax documents — links to the right surface for that email.
4. **The dashboard's own cross-host "Đổi workspace" switcher** — `PrismaSessionInfoReader`
   (`apps/api/src/modules/identity-access/infrastructure/services/prisma-session-info.reader.ts`) queries
   `where: { kind: 'dashboard', isPrimary: true, verifiedAt: { not: null } }` per membership to populate
   `ScopeMembership.adminHostname`, which `/workspaces` turns into each card's `href`.
5. **The storefront's own link back to the tenant's console** — `ResolveTenantByHostUseCase` calls
   `findPrimaryHostname(tenantId, 'dashboard')` to fill `PublicTenantResponse.adminHostname`, which the
   storefront uses to send partner-onboarding and affiliate-application CTAs to the tenant's own console
   instead of a generic fallback.

Two more sites carry the same class of bug and are worth knowing about even though they read the
*unfiltered* list rather than a backend query: `DeleteDomainUseCase`'s last-domain-in-portfolio check
now compares a domain only against same-kind siblings (deleting a tenant's last dashboard host must not
be blocked merely because a storefront host still exists, and vice versa), and the tenant settings
screen's own `domains.find(...)` picks (`routes/tenant/settings.tsx`,
`features/tenant/components/settings/settings-overview.tsx`) filter to `kind === 'storefront'` client-side
— the API's `ListDomainsUseCase` intentionally returns both kinds unfiltered, ordered `isPrimary desc,
hostname asc`, and `"admin.<slug>…"` sorts before `"<slug>…"` alphabetically, so an unfiltered `.find()`
would deterministically pick the console host instead of the storefront host.

## Known gaps

Recorded at merge so the next person finds them here rather than rediscovering them.

**An affiliate-only user still reaches a dead end, one hop later than before.** `/workspaces` now
lists approved affiliate memberships and links each to the right console, but following that link
lands on the console root: `defaultDashboardPath` and `dashboardAreasFor` have no affiliate branch, so
login redirects to `/` and the shell reports "chưa được gán vào khu vực quản trị nào" with an empty
sidebar. `/affiliate` works if typed. Affiliates are deliberately not an RBAC scope, which is why they
fall through both functions. Closing it means teaching `routes/home.tsx` to check
`apiPaths.affiliate.me` when no scope matches, and redirect to `dashboardPaths.affiliate.home`; note
that pointing the workspace card straight at `/affiliate` does **not** work on its own, because the
login action recomputes the landing area and ignores the requested path.

**`/workspaces` can stall on a degraded backend.** It used to make no backend calls at all, reading
memberships from the request context. It now awaits `/affiliate/me` and then a per-membership
`GET /public/tenant` to resolve each console hostname. Both swallow their errors, so the page cannot
fail — but with the client's 10s default timeout, a slow API delays the page for tenant and partner
users too, who need none of that data. A shorter `timeoutMs` on the affiliate branch would isolate it.

**Three comments describe superseded behaviour.** `TenantDomain.requestCustomDomain`'s docblock still
describes the insert-non-primary-then-swap dance that the unverified-primary guard removed, and its
`isPrimary` parameter is now dead (its only caller passes `false`). The admin domain card's comment
claims making a verified domain primary "stays a set-primary-domain row action" — true on the tenant
screen, but that control does not exist on the admin screen, so a platform admin currently has no
primary-domain control at all.

**Four storefront-facing hostname resolvers do not filter by kind** — `prisma-review-tenant.reader.ts`,
`prisma-content-report-tenant.reader.ts`, `prisma-favorite-tenant.reader.ts` and
`prisma-finance-tenant-host.reader.ts` accept any verified hostname. This is a consistency gap, not an
isolation one: a console hostname resolves to the same tenant that owns it, and reaching these paths
with one requires forging `x-forwarded-host` directly against the API — an attacker who can do that
can already forge any tenant's storefront hostname. Caddy never routes an `admin.*` browser request to
the storefront. Adding `kind: 'storefront'` to each `where` would make the invariant "storefront-facing
API resolves only storefront hostnames" true everywhere. While there:
`prisma-finance-tenant-host.reader.ts` filters on neither `verifiedAt` nor `tenant.status`, unlike its
three siblings.

**`tenant_domains_kind_idx` is unused.** Every query pairs `kind` with `tenant_id` or `hostname`, so
the standalone index earns nothing. Dropping it needs its own migration; the schema now declares it so
`migrate diff` stays clean in the meantime.

**Compose project names collide.** `docker-compose.yml` and `docker-compose.deploy.yml` set neither
`COMPOSE_PROJECT_NAME` nor `-p`, so both derive the same project name from the directory and share a
namespace. This already caused one incident during this feature's verification, when an orphan cleanup
stopped four unrelated local containers.

## See also

- [`docs/architecture.md`](../architecture.md) — Host→tenant resolution in the request-flow section.
- [`docs/deployment.md`](../deployment.md) — the Caddy matcher and console custom-domain TLS path.
