# apps/dashboard — @booking/dashboard (React Router 8 SSR, admin console)

Local rules for the operator dashboard (`/admin`, `/tenant`, `/partner`, `/affiliate`). Root context:
[`../../AGENTS.md`](../../AGENTS.md). Shared frontend conventions:
[`../../docs/conventions.md`](../../docs/conventions.md).

## Folder architecture (enforced by review — the old `architecture.spec.ts` was removed with the no-tests policy)

```
app/
  routes/<area>/        ROUTE MODULES ONLY — nested resource folders with semantic names
    _layout.tsx  _index.tsx  routes.ts  nav.ts   (+ e.g. bookings/{_index,detail}.tsx)
  features/<name>/       ALL non-route code — see the uniform convention below
  components/            multi-area primitives only (BackLink, PaginationBar, status badges, …)
  constants/            display-label maps, one file per domain, keys typed from @booking/contracts enums
  constants/paths        dashboardPaths — the single source of route URLs
  lib/                   infrastructure (api.server, session, auth middleware) + pure helpers
```

**Every feature uses one uniform layout** — `features/<name>/{components, server, lib}`:

- `components/` — `.tsx` UI **and** component-local helpers/hooks that belong to a single component
  (e.g. `use-promotion-scope.ts`, `booking-derive.ts`).
- `server/` — `*.server.ts` (loaders/actions/data modules). **Area features** (`admin`, `tenant`,
  `partner`, `affiliate`) additionally own a guard `server/<area>.server.ts` returning
  `{ ctx, membership, auth, can }`.
- `lib/` — feature-wide pure helpers (no JSX, no server). Omit the folder if the feature has none.
- `constants.ts` — flat, optional (only `tenant` has one today).

Area features map to the four dashboard areas; **cross-area domain features** (`bookings`,
`promotions`) are used by more than one area and have no guard — but follow the same
`{components, server, lib}` split. (Both were normalized to this on 2026-07-17; keep them uniform.)

## Import discipline

- Only a **route module** may import `./+types/*`.
- `features/**` and `components/**` never import from `routes/**`.
- Browser-reachable modules may only `import type` from `*.server` files (never a runtime import).
- Route URLs come from `~/constants/paths` (`dashboardPaths.tenant.booking(id)` …), never string-built.
- **Backend endpoints come from `~/constants/api-paths`** (`apiPaths.partner.listingRevision(id)` …).
  Keep the two apart: `dashboardPaths` is where the *browser* goes, `apiPaths` is what a loader/action
  *calls*. They often spell the same string, so a swap compiles and passes tests — check which one a
  value is used as, not what it looks like. Builders encode their params; do not wrap arguments in
  `encodeURIComponent`. Never append a query string — pass `{ query }`.
- The **`~/` alias** across directory boundaries and `./sibling` within one directory. There are no
  `../` imports left; do not reintroduce one.

## Data & auth

BFF pattern: `app/lib/api.server.ts` re-exports `apiGet`/`apiPost`/`apiPatch`/`apiPut`/`apiDelete`
(and `unwrapApiResult`) bound to `BACKEND_URL`. A root `middleware` resolves the Host header to a
tenant (or the platform console) and *then* authenticates every request into an AsyncLocalStorage
context that `requireTenant`/area guards read.
Sessions are Redis-backed; the cookie holds only a signed id. **Never fetch the backend from the
browser** — all data goes through loaders/actions. (The one prior browser-side react-query fetch was
removed on 2026-07-17; there is no `@tanstack/react-query` or direct `axios` dependency any more, and
the `@booking/query` package itself was deleted on 2026-07-27. Don't reintroduce them —
filter/paginate via the URL + a loader re-run.)

Forms use `GenericForm` with a `@booking/contracts` zod schema (see
[`../../docs/conventions.md`](../../docs/conventions.md) → Forms). UI is Vietnamese-hardcoded.

## Full-page forms

Every create/edit screen sits in `FormPage` (`~/components/form-page`). Create surfaces with ≥3
sections step through `FormWizard` (`~/components/form-wizard` + `~/hooks/use-form-wizard`); shorter
creates and **all** edit screens lay the sections out on one `FormSurface`. Create and edit of one
resource render the *same* section bodies — a form takes a `mode`/`experience` prop rather than
growing a second copy. Full rationale in [`../../docs/conventions.md`](../../docs/conventions.md)
→ *Full-page forms*.

## Design system

The dashboard has **no brand of its own**. Colours, radius and the Plus Jakarta Sans face are the
platform default from `@booking/ui/globals.css` — BookingOS amber `#ffb020` on ink `#0a0e13`, the same
one the storefront's platform landing renders. A tenant that has configured a brand overrides the
channels inline through `tenantBrandCss()` on the shell (`root.tsx`); one that has not simply keeps
the default. Style with semantic tokens only; a literal hex in app code is a defect.

`app.css` holds exactly two scopes, both for the sign-in screen (`.auth-brand-panel`,
`.auth-form-panel`). On a tenant console host the tenant is resolved from the Host header *before*
authentication, so these panels do inherit the tenant brand through `tenantBrandCss()` in
`root.tsx`; on the platform host they fall back to the BookingOS default. They are not a second
design system, and nothing else in the app should acquire one.

Geometry stays dense — `h-11` controls, no pill CTAs. The landing's `platform-*` component classes are
landing-local on purpose: an operator console and a marketing page share a palette, not a button shape.

## Constants

`constants/` holds display maps keyed by a `@booking/contracts` enum (one file per domain), the two
path modules, and `messages.ts` for repeated situation-generic failure copy. A map whose values are
CSS classes, or whose key is a UI-only union (`StatTone`, `ClosureState`), stays beside its component.
`status-badge.tsx` is the one place a domain status becomes a colour — a status' pill, calendar dot
and event chip all read the same tone from it.

## Scripts (verified)

`dev` (`react-router dev`, port `DASHBOARD_PORT`/5174) · `build` · `start` · `lint` (`eslint app`) ·
`typecheck` (`react-router typegen && tsc`). Requires Node ≥ 22.22.0.
