# Host-Based Multi-Tenancy for the Dashboard

## Goal

Give every tenant its own dashboard hostname — auto-provisioned as `admin.<slug>.<baseDomain>`, and
optionally a custom `admin.<their-domain>` they configure themselves — resolved from the `Host`
header exactly the way the storefront resolves a tenant today.

This also removes a live defect. The dashboard picks its tenant with `scopes.find(...)`
(`app/lib/workspace.ts:11`), so a user who belongs to two tenants can only ever reach the one whose
name sorts first, with no way to switch. `PrismaSessionInfoReader.listMemberships` already returns
every membership; only the frontend collapses them.

## Scope

**In:** `tenant_domains` gains a `kind` discriminator; host→tenant resolution splits by kind; the
dashboard BFF resolves its tenant from `Host`; areas are gated per host; every cross-app link and
email CTA that assumes a single dashboard URL is made tenant-aware; Caddy routes `admin.*` to the
dashboard.

**Out:** tenant self-serve signup, changes to RBAC or the permission catalog, anything in the
storefront other than the three links listed in *Cross-App Navigation*, and the backend
`PermissionsGuard` — it already accepts any tenant the caller holds a role assignment in
(`permissions.guard.ts:43-53`), so no authorization change is needed.

## Decisions

| Question | Decision |
| --- | --- |
| Role of the shared host | `admin.<baseDomain>` becomes the **platform console only**. `/tenant`, `/partner`, `/affiliate` exist only on a tenant host. |
| Default admin subdomain | Auto-provisioned, verified, primary, at tenant creation. Existing tenants are backfilled by the migration and the seed. |
| Custom admin domain | Allowed, but the hostname **must** start with `admin.`. |
| Sessions across hosts | One session per host, like the storefront. No cross-host SSO — a `domain=.bookingos.vn` cookie cannot work for a tenant's own custom domain, and shipping it would make subdomain tenants first-class and custom-domain tenants second-class. |
| `/affiliate` | Lives on the tenant host; the host's tenant replaces the `?tenant=` selector. |

### Why the `admin.` prefix is mandatory

Caddy must choose between the storefront and dashboard upstreams from the `Host` header alone, at
request time, with no config reload per tenant. Its on-demand-TLS `ask` hook (`Caddyfile:42`) only
answers "may this host get a certificate" — it cannot select an upstream, and stock Caddy has no
module that asks an HTTP endpoint which backend to use. `Caddyfile:3-11` records a deliberate
decision to keep exactly one proxy.

The alternatives were a second ingress on its own IP (doubles the TLS and ops surface for one
routing bit) and an edge router service that queries the API per request (puts a new always-on hop
in front of *every* storefront request, reversing the one-proxy decision). A reserved first label
costs the tenant one naming constraint and nothing else.

## Data Model

Add `TenantDomainKind { storefront, dashboard }` and `tenant_domains.kind NOT NULL DEFAULT
'storefront'`.

`tenant_domains_hostname_key` stays globally unique — a hostname is only ever one thing. The
one-primary index must widen:

```
tenant_domains_one_primary_per_tenant_key  (tenant_id)        WHERE is_primary
→                                          (tenant_id, kind)  WHERE is_primary
```

so each tenant carries one primary storefront domain and one primary dashboard domain.

Hand-written migration per ADR 0004, in three parts: add the enum and column, replace the index, and
backfill `admin.<slug>.<baseDomain>` (verified, primary, `kind='dashboard'`) for every existing
tenant. The backfill inserts only where that hostname is free — `tenant_domains_hostname_key` is
global, so a tenant that already registered the name as a storefront domain must be left for an
operator to resolve rather than have the migration fail the whole deploy. `tenant_domains` already
carries the `tenant_isolation` policy, so no new RLS migration is needed — but
`pnpm --filter=@booking/api check:rls` must still pass.

### The silent-breakage set

`kind` gives each tenant two rows with `is_primary = true`. Every query that reads "the primary
domain" without filtering kind starts returning the admin host non-deterministically, and none of
them fail loudly. All five must be scoped:

| Site | Consequence if missed |
| --- | --- |
| `notification/infrastructure/prisma-notification.reader.ts` — four `AND td.is_primary = true` sub-selects | Every email's `storefrontUrl` (booking links, OTP, legal) points at the admin console |
| `affiliate/infrastructure/repositories/prisma-affiliate.repository.ts` — `domains: { where: { isPrimary: true }, take: 1 }` | `AffiliateResponse.tenantHostname` is wrong, so **every affiliate referral link** built in `dashboard/app/routes/affiliate/links.tsx` points at the console |
| `tenancy/infrastructure/repositories/prisma-tenant-domain.repository.ts` — `setPrimary` clears `where: { tenantId, isPrimary: true }` | Promoting a storefront domain clears the dashboard primary |
| `tenancy/application/use-cases/get-tenant-detail.use-case.ts` — `domains.find(d => d.isPrimary)` | The admin tenant-detail "view storefront" link is wrong |
| `tenancy/application/use-cases/delete-domain.use-case.ts` + `assertDeletableFromPortfolio` | The last verified *dashboard* domain becomes deletable because a storefront domain still exists |

The portfolio rule in `tenant-domain.entity.ts` therefore becomes per-kind: the target's siblings are
the verified domains **of the same kind**.

## Resolution

`ITenantCache.getHost` currently returns `string | null | undefined` (tenant id only). It becomes
`{ tenantId, kind } | null | undefined`. Bump the Redis key prefix (`tenant:host:v2:`) so entries
written by the old shape cannot be misread by a freshly deployed process while the cache is warm.

- `ResolveTenantByHostUseCase` filters `kind='storefront'`. This is mandatory, not cosmetic: ten
  modules consume it (booking, payments, catalog, listing, legal, reviews, favorites, promotions,
  affiliate, scheduling), and without the filter an admin host resolves as a valid storefront tenant
  everywhere.
- `ResolveTenantByAdminHostUseCase` (new file, one use-case per file) filters `kind='dashboard'` and
  returns tenant id, name, slug, `DashboardBrandConfig`, and status.
- `CheckDomainTlsAllowedUseCase` stays kind-agnostic — both kinds need certificates. Only the cache
  shape changes.

**The admin host does not use the storefront's `live` flag.** A tenant whose subscription has expired
must still reach its console to renew; locking them out of the page where they pay is the wrong
failure. The admin host refuses **only** when `tenant.status === 'suspended'`.

Note the trap: `TenantStatus` has three values — `active`, `suspended`, `expired` — so a
`status != 'active'` test would lock out exactly the lapsed tenant this rule exists to protect.
`expired` is a lapsed tenant, not a disciplinary state; it renders the console with a renewal banner
like any other expiry. Only `suspended` is a platform decision the tenant cannot undo themselves, and
only it is worth a closed door.

## Domain Lifecycle API

`addDomainInputSchema` gains `kind`. `AddDomainUseCase` enforces two symmetric rules, as named
`DomainError`s in `tenancy/domain/errors/tenancy-errors.ts`:

- `kind='dashboard'` and the hostname does not start with `admin.` → refuse.
- `kind='storefront'` and the hostname starts with `admin.` → refuse.

Everything else is reused unchanged: the TXT token from `TenantDomain.requestCustomDomain`,
`VerifyDomainUseCase` and its background worker, `CheckDomainDnsUseCase`, `SetPrimaryDomainUseCase`,
and the `customDomain` plan gate in `AssertCustomDomainAllowedUseCase`. `ListDomainsUseCase` and
`domainResponseSchema` expose `kind` so the settings screen can group the two lists.

`CreateTenantUseCase` provisions `admin.<slug>.<baseDomain>` alongside the storefront subdomain in
the same transaction; `TenantDomain.provisionDefaultSubdomain` takes a `kind`.

`CheckDomainDnsUseCase` keeps comparing against `TenancyConfig.storefrontCname` /
`storefrontIpv4` (env `PLATFORM_STOREFRONT_CNAME` / `PLATFORM_STOREFRONT_IPV4`). An admin host points
at the same Caddy, so the values are correct as-is; only the docblock needs to say so. The env names
are deliberately left alone — renaming them is a real ops step on a running stack, bought for
nothing but a tidier name.

## Ingress

Inside the catch-all block at `docker/caddy/Caddyfile:89`:

```
https:// {
	import common
	tls { on_demand }
	@dashboard header_regexp Host ^admin\.
	handle @dashboard { reverse_proxy dashboard:3000 }
	handle              { reverse_proxy storefront:3000 }
}
```

`header_regexp` is a core matcher, so the stock `caddy:2-alpine` image still works. The explicit
`{$DASHBOARD_HOST}` site block at line 60 continues to win for the platform console, because an
explicit site address outranks the catch-all. Validate with `caddy validate` before shipping, as
`Caddyfile:20-24` already instructs.

## Dashboard Application

Resolution mirrors the storefront's: resolve the host, then run the request inside an
AsyncLocalStorage context.

- `app/lib/tenant-host.server.ts` (new) — `resolveDashboardHost(request)` returns
  `{kind:'platform'} | {kind:'tenant', tenant} | {kind:'unknown-host'}`. Platform-host detection
  mirrors the storefront's `isPlatformHostname`: the configured `DASHBOARD_HOST`, a single-label host
  such as `localhost`, or a bare IP literal.
- `app/lib/api.server.ts` — send `x-forwarded-host`, which the dashboard does not send today.
- `app/lib/request-auth.server.ts` — the request state carries the host resolution.
- `app/lib/auth-middleware.server.ts` — resolve host, authenticate, then cross-check that the
  signed-in user holds a membership in the host's tenant.

Because the tenant arrives through AsyncLocalStorage rather than a parameter, **`requireTenant(request,
permission?)` keeps its signature and all 65 call sites are untouched.** Only the four guards change
internally:

- `requireTenant` — tenant id comes from the host; membership is looked up by that id
  (`tenantMembership(info, hostTenantId)`), never `.find()`. No membership is a 403 naming the tenant.
- `requirePartner` — the partner membership must be inside the host's tenant.
- `requireAffiliate` — drops `?tenant=`; the host's tenant is the active membership.
- `requirePlatform` — only reachable on the platform host.

Area gating:

- platform host: `/admin`, `/auth/*`, `/workspaces`, `healthz`, the presign routes.
- tenant host: `/tenant`, `/partner`, `/affiliate`, `/auth/*`.

A wrong-host path answers **404, never a cross-host redirect** — bouncing a visitor to
`admin.<some-tenant>.…` would disclose which tenants exist and which one this caller belongs to.
The single exception is same-host and leaks nothing: an *authenticated* request for `/tenant`,
`/partner` or `/affiliate` on the platform host redirects to `/workspaces`, which lists only that
caller's own memberships. The same paths for an anonymous caller 404 like any other wrong-host path,
so the directory is never a probe.

`activeTenantMembership(info, pathname)` in `app/lib/tenant-brand.ts` — the other `.find()` — is
deleted; the brand comes from the host. That has a welcome consequence: `apps/dashboard/CLAUDE.md:80-82`
records that the sign-in screen cannot carry a tenant brand because it "renders *before* a tenant is
known". Under host resolution the tenant **is** known before login, so `.auth-brand-panel` /
`.auth-form-panel` can finally take the tenant's colours. Update that note.

`/workspaces` changes role: on the platform host it becomes a **cross-host directory** listing every
tenant and partner membership with absolute links to each admin host, and the landing spot for
`/tenant` typed on the platform host. `ScopeMembership` (contracts + `PrismaSessionInfoReader`) gains
`adminHostname` to build those links.

## Cross-App Navigation

Three storefront links break, because they point at a shared host where `/partner` will no longer
exist. All three render on a tenant host, so the tenant is already resolved:

| File | Today |
| --- | --- |
| `features/partner-onboarding/server/partner-registration-start-route.server.ts:33` | `redirect(${DASHBOARD_URL}/partner)` |
| `features/partner-onboarding/components/partner-done-page.tsx:31` | `${dashboardUrl}/auth/login` |
| `features/affiliate/components/affiliate-application-page.tsx` (via `use-affiliate-application-page-controller.ts`) | `${dashboardUrl}/auth/login` |

`publicTenantResponseSchema` gains `adminHostname: string | null`; the storefront builds these three
links from it and falls back to `DASHBOARD_URL` when null.

`platform-header.tsx` and `sections/platform-footer.tsx` (via `root-loader.server.ts:62`) are
**correct as they stand** — they appear only on the `kind:'platform'` payload, i.e. the BookingOS
landing pointing at the platform console. `DASHBOARD_URL` stays required in
`storefront/app/lib/server/env.server.ts` for exactly that.

The dashboard→storefront direction (`routes/affiliate/links.tsx`, `routes/tenant/settings.tsx`,
`routes/admin/tenants/detail.tsx`) already builds URLs from the tenant's hostname rather than an env
var, so it needs nothing beyond the kind filters above.

### Email CTAs

`EmailBrand.dashboardUrl` is `process.env.DASHBOARD_URL` (`prisma-notification.reader.ts:73,294`),
feeding five partner CTAs: `/partner/bookings/:id` (`booking-notification-data.ts`),
`/partner/listings` (`dispatch-listing-event`), `/partner/revenue`
(`dispatch-tax-certificate-event`), and `/partner` plus `/partner/profile#agreements`
(`dispatch-partner-event`). All five point at a host that will not serve `/partner`.

Add a `dashboardUrl(hostname)` helper mirroring the existing `storefrontUrl()` at
`prisma-notification.reader.ts:303-309`, including its `.localhost` branch (port `5174` instead of
`5173`), resolving the tenant's primary `kind='dashboard'` domain. The four brand sub-selects gain a
second lookup for the admin hostname.

## Seed and Local Development

The seed adds an admin domain per demo tenant, in both host families the seed already registers:
`admin.bookingstudio.localhost` / `admin.bookingstad.localhost`, and the `admin.<slug>.stg.bookingos.vn`
pair. Dev URLs become `admin.bookingstudio.localhost:5174`; `vite.config.ts` needs no change, since the
storefront already serves `.localhost` hosts under the same configuration.

## Error Handling

| Situation | Response |
| --- | --- |
| Host not in `tenant_domains` with `kind='dashboard'` | 404 unknown-host page, the storefront's `unknown-host` shape — never the BookingOS console |
| Signed-in user holds no membership in the host's tenant | 403 naming the tenant, with a sign-out link. No redirect and no tenant list |
| Tenant `status === 'suspended'` | 403 suspended page |
| Tenant `status === 'expired'`, or subscription lapsed | Renders normally with a renewal banner — never a closed door |
| Path belongs to the other host class | 404 |
| API resolution unavailable (5xx) | 503, matching `resolveStorefront`'s existing behaviour |

## Verification

No tests, per ADR 0005. Run the full static check:
`pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls`,
plus `caddy validate` against the compose-pinned Caddy version.

Then exercise the real app: sign in at `admin.bookingstudio.localhost:5174` and confirm the tenant
brand appears on the login screen; confirm `/admin` 404s there and `/tenant` 404s on
`localhost:5174`; confirm a user with no role in a tenant gets the 403; add a custom `admin.` domain
through tenant settings and confirm a non-`admin.` hostname is refused; check Mailpit that a partner
email CTA points at the tenant's admin host; and confirm an affiliate referral link still points at
the storefront host, not the console.
