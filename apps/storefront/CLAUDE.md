# apps/storefront — @booking/storefront (React Router 8 SSR, customer-facing)

Local rules for the customer storefront. Root context: [`../../AGENTS.md`](../../AGENTS.md). Frontend
conventions shared with the dashboard: [`../../docs/conventions.md`](../../docs/conventions.md).

## Folder architecture (enforced by the frontend-structure guard in `pnpm test`)

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
  **Server code that reads meaning out of a pathname must go through `documentPathname()`**
  (`lib/server/data-request.server.ts`). A client-side navigation to `/en` does not request `/en` — it
  requests `/en.data`, and matching the raw pathname silently breaks: `resolveLocale` finds no locale
  and falls back to the cookie, and the platform host's `PLATFORM_DOCUMENT_PATHS` allowlist redirects
  the request away. Both bugs looked like "the language switcher does nothing".
  The tenant switcher posts to `/set-locale`; the **platform landing cannot**, because that host
  answers GET and HEAD only (see the security note below), so it uses links and the middleware writes
  `sf_locale` when it serves `/vi` or `/en`.
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

### Surface shape is tenant config too, at every breakpoint

`theme_config.surface` drives `--sf-surface-radius`, `--sf-image-radius`,
`--sf-surface-border-{width,color}`, `--sf-surface-shadow`, `--sf-surface-pad` and `--sf-section-gap`
(plus `--sf-base-size`). Panels are hand-rolled here rather than shadcn `Card`s, so they inherit
nothing on their own and have to opt in:

- **A content panel** takes `SectionCard`, or `PANEL_SURFACE` / `SURFACE_FRAME` from
  `~/constants/surfaces`. **A bounded-but-not-lifted region** — a table inside a card, a collapsible
  body, a stat tile — takes `SURFACE_OUTLINE` (radius + border, no shadow): it sits on a surface that
  already carries the tenant's shadow, and a second one reads as a card inside a card.
- **Images** take `rounded-(--sf-image-radius)`.
- **Never shadow one of those tokens with a fixed shape at a breakpoint.** `rounded-(--sf-image-radius)
  md:rounded-md` looks harmless and means "the tenant's radius applies on phones only" — the desktop
  half silently ignores `theme_config`. This is not hypothetical: the tokens were introduced that way
  (`eef5dc0e`, "improve tenant config") by adding the token and keeping the old literal as a `md:`
  override, and every such site was still mobile-only until 2026-08-18. **`pnpm test`
  now fails the build on it** (in CI).
- **Substituting** a fixed shape is the bug; **removing** the surface is not. `md:rounded-md` says
  "use 6px instead of whatever the tenant chose". `md:rounded-none` / `md:shadow-none` / `md:border-0`
  say "this element has no surface at this width" — a panel dissolving into the frame around it, an
  image sitting flush in its container. The guard flags only the first, which is why it needs no
  allowlist. `max-md:` is likewise fine: it strips the frame *below* a breakpoint, and the tenant's
  shape still applies from there up.
- **A child of an `overflow-hidden` surface needs no radius at all** — the parent clips it. Giving the
  cover image its own `rounded-(--sf-image-radius)` inside `listing-card` did nothing at the top (the
  card already clipped it) and produced a rounded *bottom* edge floating mid-card, which a
  `sm:rounded-none` then patched from `sm` up only. Let the parent do the clipping.
- **Not tenant surfaces:** buttons, inputs, badges, alerts, dropdown/dialog chrome, radio-style option
  tiles and dashed empty-state placeholders. Their shape belongs to the design system.
- A **skeleton must use the same tokens as the component it stands in for.** A fixed `md:rounded-lg` on
  a placeholder whose real card reads `SURFACE_FRAME` makes the panel visibly jump the moment data
  arrives, for every tenant whose surface is not the default.

### The CSP nonce and hydration

Every nonce-bearing element we render (`TenantThemeStyle`'s `<style>`, the three routes'
JSON-LD `<script>`) carries `suppressHydrationWarning`. **Do not remove it, and do not go
looking for the "real" mismatch it hides.** Once a browser applies the CSP it blanks the
`nonce` **content attribute** in the DOM — deliberate, per the HTML spec, so a
`[nonce="…"]` selector cannot exfiltrate it — while keeping the value on the IDL
property. Measured: `getAttribute('nonce') === ""` on every such element while
`el.nonce` still holds the real value. React hydration compares the content attribute,
so without the suppression every page load logs a mismatch it says it "won't patch up",
forever — which trains everyone to ignore the one console error that matters.

One mismatch remains in **dev only** and is not ours: React Router's critical-CSS
`<link data-react-router-critical-css href="/@react-router/critical.css?…">`. Its
`criticalCss` context value exists on the server and not on the client, so RR renders it
with `nonce={undefined}` against a DOM that has the blanked attribute. The whole
`unstable_getCriticalCss` export is emitted only when Vite runs as `serve`
(`@react-router/dev/dist/vite.js`, `viteCommand === 'serve' ? … : ''`), so the element
does not exist in a production build.

### The platform landing is not a tenant surface

`features/platform-landing` renders only for `kind: 'platform'` (the configured platform base domain,
`localhost`, or a bare IP), so `TenantThemeStyle` never mounts above it and **no tenant theme can
reach it**.

Its BookingOS brand (amber `#ffb020` on near-black) is **the platform default**, and lives in
`:root`/`.dark` in `@booking/ui/globals.css` — not in a scope on this page. The same values back
`BRAND_DEFAULTS`, so one brand covers the landing, the dashboard's un-themed surfaces, and any tenant
that has configured no colours. Sections style themselves with ordinary semantic utilities (`bg-card`,
`text-muted-foreground`, `bg-primary`, `ring-ring`) and never a literal colour. A tenant that *has*
configured colours still wins everywhere, because `themeCss()` emits every token into `:root` at SSR.

What remains in the `.platform-landing` scope is only landing-specific: `--platform-*` covers the roles
shadcn has no slot for (ink/muted steps, the amber text scale, status green, elevation). Dark bands opt
in with `className="dark"` and now read the **shared** `.dark`, so only the `--platform-*` steps are
restated in `.platform-landing .dark`. The old rule that *every* token a dark band touched had to be
restated there is gone with the base tokens that caused it.

Two things the landing's CSS must not do. Do not set a `display` on a `platform-*` class that a caller
needs to toggle: `app.css` is unlayered, so it outranks Tailwind's `hidden`/`sm:*` and the element can
never be hidden at a breakpoint — supply the display as a utility through `cn` instead (see
`.platform-locale-switcher`). And do not reintroduce base colour tokens into `.platform-landing`; a
rebrand belongs in `@booking/ui/globals.css`, where both apps get it.

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

[ADR 0009](../../docs/decisions/0009-limited-tests-policy.md) allows tests in the API's use-case layer
and in `tests/architecture/` — **not here**. The storefront gets no component, route or e2e tests.
Its rules are enforced statically instead, by the storefront-security, frontend-structure,
theme-token and tenant-surface guards in `pnpm test`. For tenant guards, session rotation/locking,
request-security, parsers, money/idempotency and time-sensitive changes, use those guards plus lint,
typecheck, production build and manual runtime flows.

## Scripts (verified)

`dev` (`react-router dev`, port `STOREFRONT_PORT`/5173) · `build` · `start`
(`react-router-serve ./build/server/index.js`) · `lint` (`eslint app`) · `typecheck`
(`react-router typegen && tsc`). Requires Node ≥ 22.22.0.
