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
- The dashboard uses the **`~/` alias** everywhere (unlike the storefront's relative imports).

## Data & auth

BFF pattern: `app/lib/api.server.ts` re-exports `apiGet`/`apiPost`/`apiPatch`/`apiPut`/`apiDelete`
(and `unwrapApiResult`/`requireData`/`unwrapList`) bound to `BACKEND_URL`. A root `middleware`
authenticates every request into an AsyncLocalStorage context that `requireTenant`/area guards read.
Sessions are Redis-backed; the cookie holds only a signed id. **Never fetch the backend from the
browser** — all data goes through loaders/actions. (The one prior browser-side react-query fetch was
removed on 2026-07-17; there is no `@tanstack/react-query`, `@booking/query`, or direct `axios`
dependency any more. Don't reintroduce them — filter/paginate via the URL + a loader re-run.)

Forms use `GenericForm` with a `@booking/contracts` zod schema (see
[`../../docs/conventions.md`](../../docs/conventions.md) → Forms). UI is Vietnamese-hardcoded.

## Scripts (verified)

`dev` (`react-router dev`, port `DASHBOARD_PORT`/5174) · `build` · `start` · `lint` (`eslint app`) ·
`typecheck` (`react-router typegen && tsc`). Requires Node ≥ 22.22.0.
