# apps/storefront — @booking/storefront (React Router 8 SSR, customer-facing)

Local rules for the customer storefront. Root context: [`../../AGENTS.md`](../../AGENTS.md). Frontend
conventions shared with the dashboard: [`../../docs/conventions.md`](../../docs/conventions.md).

## Folder architecture (enforced by `pnpm check:frontend-structure`)

```
app/
  routes/                 ROUTE MODULES ONLY — group nested flows/resources by semantic name
  features/<name>/        ALL non-route code — see the uniform convention below
  components/             cross-feature UI primitives only
  hooks/                  cross-feature hooks only
  constants/              paths and shared display constants
  lib/                    genuinely shared pure helpers (no JSX)
    server/               cross-feature server infrastructure/request helpers
```

**Every feature uses one uniform layout** — `features/<name>/{components, hooks, server, lib}`:

- `components/` — `.tsx` feature UI. Account page components may be grouped one level deeper by page.
- `hooks/` — feature-local controller hooks (`use-*`); never leave these in `components/`.
- `server/` — `*.server.ts` loader/action/BFF bodies owned by the feature.
- `lib/` — feature-local pure helpers, constants and types (no JSX, no server).

Omit empty folders. A feature's second-level folders may only use these four names.

A file referenced by `app/routes.ts` may expose React Router route-module exports only:
`default`, `loader`, `clientLoader`, `action`, `clientAction`, `middleware`, `clientMiddleware`,
`ErrorBoundary`, `HydrateFallback`, `headers`, `handle`, `links`, `meta`, and `shouldRevalidate`.
Keep these exports as thin adapters. Page UI, controller hooks, request handlers, schemas, constants,
response builders and other support functions belong to the owning feature. `routes/` must not contain
support modules imported by other routes. Dashboard area-local `routes.ts`/`nav.ts` files are deliberate
route-config/navigation exceptions; storefront currently has no equivalent exception.

## Import discipline

- Only a **route module** may import its generated relative `./+types/*`; this path does not resolve
  through `~/`.
- `features/**`, `components/**`, `hooks/**`, and `constants/**` never import from `routes/**`.
- Browser-reachable modules may only `import type` from `*.server` files (never a runtime import).
- Route URLs come from `~/constants/paths` (`storefrontPaths.account.booking(code)` …), never
  string-built. The same-origin presign proxies (`storefrontPaths.uploadPresign`,
  `reviewUploadPresign`) live there too: the upload widget requests them directly, so they are
  storefront routes, not backend endpoints.
- **Backend endpoints come from `~/constants/api-paths`** (`apiPaths.public.listing(slug)` …). Only
  `*.server.ts` modules consume it. Builders encode their params — do not wrap arguments in
  `encodeURIComponent`. Never append a query string to a path: pass the helper's `query` option, which
  is also part of the read-memoization key, so a query hidden in the path splits the cache.
- Use the **`~/` alias** for every import that crosses a directory boundary; keep `./sibling` for files
  in the same directory. Do not use `../`.

## What's different from the dashboard

- **Multi-tenant by `Host` header.** The tenant is resolved per-request from the hostname via a backend
  call in `app/lib/server/tenant.server.ts` (not from a login). One storefront serves every tenant's
  domain; an unmapped host returns the unknown-storefront 404 page. The exact
  `PLATFORM_BASE_DOMAIN`, a **single-label host (`localhost`)**, or a bare IP short-circuits to the
  BookingOS platform landing with no backend call. Every other multi-label host goes through
  resolution because a tenant may map its own apex (`giangstudio.vn`), not just a subdomain.
- **Bilingual.** Every page nests under a `/:locale` (`vi` | `en`) layout backed by `@booking/i18n`;
  unlocalized legacy paths are kept as redirect route modules for inbound links. The dashboard, by
  contrast, is Vietnamese-hardcoded.
- **Public + guest flows.** Most pages are public; authenticated bits (bookings, checkout) use a
  Redis-backed session; guest checkout authenticates by booking code + email OTP.

## Tenant theming (untrusted input — handle with care)

`app/lib/theme.ts` turns the tenant's `theme_config.colors` into a `:root{…}` block injected once at
SSR (see `root.tsx`), overriding the shadcn base tokens (`--background`, `--primary`, `--ring`) so every
`@booking/ui` component renders in the tenant brand. Rules:

- Tenant color strings are **untrusted** (tenant jsonb). Always pass them through `sanitizeColor()`
  before they enter CSS — it rejects anything but hex / a safe color function and defeats
  `</style>`/CSS injection. Never interpolate a raw tenant value into a style.
- Channel resolution is shared with the dashboard: `brandSwatch(value, BRAND_DEFAULTS.x)` from
  `@booking/ui/lib/brand-theme` sanitizes, derives a readable foreground and falls back to the
  platform colour. Never hardcode a foreground, and do not re-implement the fallback locally — the
  two frontends must turn one tenant config into one brand.
- Override the **base** token (`--primary`), not `--color-primary`. `--accent` is deliberately NOT
  tenant-driven (it's shadcn's neutral hover surface). Legacy `--sf-primary` / `--sf-accent` /
  `--sf-background` are still emitted for hand-rolled classNames — prefer semantic tokens for new work.

### The platform landing is not a tenant surface

`features/platform-landing` renders only for `kind: 'platform'` (the configured platform base domain,
`localhost`, or a bare IP), so `TenantThemeStyle` never mounts above it and **no tenant theme can
reach it**. Its BookingOS brand
(amber `#ffb020` on near-black) is fixed in the `.platform-landing` scope in `app/app.css`, which
overrides the same shadcn **base** tokens — so its sections style themselves with ordinary semantic
utilities (`bg-card`, `text-muted-foreground`, `bg-primary`, `ring-ring`) and never a literal color.
`--platform-*` covers only the roles shadcn has no slot for (ink/muted steps, the amber text scale,
status green, elevation). Dark bands opt in with `className="dark"` and read the flipped set in
`.platform-landing .dark`; **every token a dark band uses must be restated there**, because
`@booking/ui`'s `.dark` and `.platform-landing` have equal specificity and `.platform-landing` wins on
source order. Do **not** move this brand into the global `:root` to make it "tenant-overridable": it
would hand every un-themed tenant storefront BookingOS's amber, and there is no tenant here to override.

## BFF & data

Server-only domain/BFF modules live under `app/features/<name>/server/`; only cross-feature
infrastructure and genuinely shared request helpers remain in `app/lib/server/*.server.ts`.
Loaders/actions call the backend server-to-server. **Never fetch the backend from the browser** and
never value-import a `*.server.ts` module into browser code (type-only imports are allowed).
Feature-local hooks live in `features/<name>/hooks/`, not `components/`; feature-local pure
helpers/types live in `lib/`. Neither shared nor feature-local `lib/` contains JSX. Forms use
`GenericForm` with a zod schema from `@booking/contracts`
(see [`../../docs/conventions.md`](../../docs/conventions.md) → Forms).

Runtime environment reads are centralized in `app/lib/server/env.server.ts`. Production startup fails
when the API, Redis, session secret, dashboard URL or payment-origin allowlist is missing/unsafe.
Unsafe HTTP methods pass through the root same-origin guard before auth; `/healthz` and `/readyz` are
exact operational exceptions and must never resolve a tenant or session.

Image upload works: `app/routes/uploads.presign.tsx` is a same-origin presign proxy that replays the
auth cookie to the backend `POST /uploads/presign`, then the browser PUTs bytes straight to MinIO/S3.
(The dashboard has its own presign route; the storefront's is real — older docs claimed it had none.)

## Verification

ADR 0005 prohibits automated tests and test scripts. Use the static security gate, lint, typecheck,
production build and manual runtime flows for tenant guards, session rotation/locking,
request-security, parsers, money/idempotency and time-sensitive changes.

## Scripts (verified)

`dev` (`react-router dev`, port `STOREFRONT_PORT`/5173) · `build` · `start`
(`react-router-serve ./build/server/index.js`) · `lint` (`eslint app`) · `security` (static policy
gate) · `typecheck`
(`react-router typegen && tsc`). Requires Node ≥ 22.22.0.
