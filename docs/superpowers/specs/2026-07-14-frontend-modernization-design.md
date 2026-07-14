# Frontend Modernization Design

## Objective

Modernize the Storefront and Dashboard frontends described in the referenced
conversation while preserving existing product behavior and backend APIs. The
finished frontend must use React Router 8 Framework Mode, build successfully,
handle authentication once per request, scope tenant and partner permissions to
the active workspace, validate API responses at runtime, and provide SSR-safe
query hydration, multilingual SEO, deployment containers, and automated tests.

## Scope

### Included

- `apps/storefront`
- `apps/dashboard`
- `packages/api-client`
- `packages/auth`
- `packages/contracts`
- `packages/ui`
- New focused packages such as `packages/query` and `packages/i18n`
- Frontend-facing Turborepo, Docker, test, and CI configuration
- Frontend BFF session persistence in Redis

### Excluded

- Business logic or architecture changes in `apps/api`
- Database schema or migration changes
- Dark mode work
- Product redesign unrelated to the modernization
- Rewriting working route UI solely for style consistency

Existing Dashboard dark-mode components and behavior are preserved, but this
project does not expand, redesign, or port dark mode to additional surfaces.

If a frontend contract does not match the current API, the implementation will
adapt the frontend contract or client first. Changes to `apps/api` require a
separate explicit decision.

## Current Baseline

- Node available locally: `v24.7.0`
- pnpm: `10.13.1`
- Manifests declare React Router `^7.7.0`; the current lockfile resolves `7.18.1`
- Storefront typecheck passes, but production build fails because
  `app/features/checkout/index.ts` exposes a server-only module to the client graph
- Dashboard typecheck and production build pass on the current dependency set
- Dashboard auth refresh can occur independently in root and nested loaders
- Dashboard session secrets have a public development fallback
- Tenant and partner helpers select the first membership instead of an explicit
  active workspace
- A pre-existing uncommitted change exists in
  `apps/dashboard/app/routes/affiliate/_index.tsx`; the modernization must preserve
  it and avoid editing the file unless a mechanical route migration requires it

## Platform Baseline

The target baseline is:

- Node `>=22.22.0`
- React and React DOM `>=19.2.7`
- React Router Framework Mode v8
- Vite 7+
- Axios v1 as the shared HTTP transport
- ESM-only frontend packages
- pnpm `10.13.1`

All React Router packages in an app must resolve to the same exact v8 version.
The exact patch version will be selected from the package registry when the
dependency milestone starts and will be recorded in the lockfile.

React Router v8 middleware is always enabled and loader/action `context` is a
`RouterContextProvider`. Deprecated `meta({ data })` access is replaced by
`meta({ loaderData })`. Route modules own server-only exports so React Router can
remove them from browser bundles.

## Delivery Strategy

The work is delivered as independently verifiable milestones. A milestone may
not begin until the preceding milestone passes its focused typecheck, tests, and
production build. This prevents the version upgrade, auth rewrite, and feature
refactors from obscuring one another's failures.

### Milestone 1: Restore Storefront Build and Correctness

- Move `loader`, `action`, and `meta` into actual route modules for catalog,
  listing, and checkout
- Keep feature page components client-safe
- Remove server exports from feature barrels
- Fix locale open redirect, favicon lookup, and checkout idempotency
- Replace browser-visible OTP query parameters with a Storefront POST action that
  stores the verified lookup credential in a short-lived signed HttpOnly cookie;
  the BFF may continue sending the OTP to the existing API query parameter, but
  browser history, analytics, referrers, and rendered links must never contain it
- Replace swallowed infrastructure failures with typed HTTP failures while
  preserving legitimate empty results
- Remove sensitive debug logging

Success: Storefront typecheck and production build pass, and no feature/client
module imports a `.server` module.

### Milestone 2: Upgrade the Runtime Baseline

- Upgrade React, React DOM, React Router packages, and compatible type packages
- Raise the Node engine and add a pinned local Node version file
- Remove obsolete v8 future flags because v8 behavior is the default
- Adopt `loaderData`, normalized loader URLs, ESM-only imports, and current route
  module types
- Remove `react-router-dom` imports, deprecated `meta.data` access, and redirects
  that replay raw `request.url` data-request URLs
- Align `@booking/ui` React/React DOM/React Router peer dependencies, preserve
  subpath imports, and keep raw TSX consumers in `ssr.noExternal`
- Audit direct workspace dependencies so `turbo prune --docker` includes every
  package imported by each frontend
- Update Turborepo outputs for React Router build and generated artifacts
- Update maintained repository documentation from the React Router 7 baseline to
  React Router 8

Success: both apps typecheck and build using React Router v8.

### Milestone 3: Request-Scoped Dashboard Authentication

- Fail startup when `SESSION_SECRET` is absent or shorter than 32 characters
- Support cookie-signing secret rotation through current and previous secrets
- Add one root server middleware that reads the cookie, validates the backend
  session, refreshes at most once, and commits rotated tokens after `next()`
- Store authenticated session info in typed React Router contexts
- Make root, admin, tenant, partner, affiliate, upload, login, and logout routes
  consume the context instead of independently loading or refreshing tokens
- Prevent logout from being overwritten by a middleware post-response commit
- Treat network/5xx auth failures as service failures, not invalid credentials
- Replace token-bearing cookie payloads with a random opaque session ID and keep
  access tokens, refresh tokens, user ID, and active workspace preferences in
  Redis-backed BFF session storage
- Use distinct Dashboard and Storefront cookie names; cookies are HttpOnly,
  SameSite=Lax, Secure in production, bounded by an explicit TTL, and revocable

Success: one `/auth/session` flow and at most one refresh occur per dashboard
request, including requests with parallel nested loaders.

### Milestone 4: Explicit Active Workspaces and Route Builders

- Add locale-safe Storefront path builders and scoped Dashboard path builders
- Scope Dashboard URLs with `tenant/:tenantId` and `partner/:partnerId`
- Scope Affiliate membership selection explicitly by tenant-aware URL rather than
  `?tenant=` fallback or the first approved membership
- Validate URL IDs against the authenticated memberships in layout middleware
- Check permissions only on the active membership
- Add a workspace chooser and compatibility redirects for old unscoped URLs
- Add protected-layout and focused `requireUser`, `requireSessionInfo`,
  `requireScope`, and active-membership helpers that consume request context
- Keep global navigation workspace-neutral; render scoped menus from the scoped
  layout's membership

Success: a multi-tenant user cannot inherit permissions or cached data from a
different tenant or partner.

### Milestone 5: Typed API Client and Runtime Contracts

- Replace refresh-aware per-call helpers with an Axios-based transport-only API
  client
- Create isolated Axios instances from explicit request options; never mutate a
  process-wide instance with request-specific access tokens or workspace headers
- Support `AbortSignal`, a bounded timeout, query serialization, JSON/FormData,
  request IDs, scope headers, and typed failure categories
- Use Axios for both server-to-server API calls and browser-to-same-origin resource
  calls; browser code never calls an internal Docker API hostname directly
- Validate successful endpoint responses with Zod schemas from contracts
- Distinguish HTTP, network, timeout, and invalid-response failures
- Keep React Router response mapping inside each app instead of coupling the
  shared API client to React Router
- Migrate endpoint groups incrementally and delete obsolete helpers after all
  consumers move

Success: empty success responses are distinct from 404/5xx failures, invalid
backend shapes become 502 failures, and cancelled navigations cancel Axios
requests through `AbortSignal`.

### Milestone 6: Error Recovery and Reporting

- Add reusable route error UI in `@booking/ui`
- Add root, protected-area, admin, tenant, partner, Storefront catalog/listing,
  checkout, and booking boundaries
- Preserve the nearest usable shell when a child route fails
- Keep ordinary form validation in action data instead of ErrorBoundary
- Add server and client reporting hooks that ignore expected 4xx responses and
  aborted requests and redact credentials
- Split the largest Dashboard route modules into capability-focused feature
  modules so route files retain only loader/action/meta/boundary/adapter concerns
- Normalize shared UI consumption through `@booking/ui` subpath exports; reusable
  components remain in the package and feature-specific UI remains in its app

Success: route failures produce correct status-specific UI without exposing
stack traces or removing unrelated navigation.

### Milestone 7: Selective TanStack Query SSR

- Create an SSR-safe `@booking/query` package
- Create a new QueryClient per server prefetch and one stable browser client
- Introduce feature query keys containing active workspace and normalized URL
  filters
- Parse, validate, and normalize pagination, search, sort, and filter URL params
  with Zod; the URL remains the source of truth and filter changes reset page 1
- Use same-origin resource routes for browser refetches so HttpOnly tokens remain
  server-side
- Prefetch required queries in loaders, dehydrate successful non-sensitive data,
  and hydrate with identical server/client keys
- Audit `clientLoader` hydration separately and add React Router
  `HydrateFallback` only where `clientLoader.hydrate` participates in initial
  hydration; do not confuse it with TanStack `HydrationBoundary`
- Retain React Router actions for navigational and progressively enhanced forms;
  use mutations only for inline/optimistic behavior
- Adopt queries first for booking lists/details, Storefront catalog, availability,
  quotes, and payment-status polling; ordinary one-shot route data stays in
  React Router loaders
- Load React Query Devtools only in development builds

Success: initial SSR data does not immediately refetch, tenant caches cannot
collide, and sensitive auth/payment data is never dehydrated.

### Milestone 8: Storefront SEO and Application i18n

- Introduce `/vi` and `/en` URL prefixes with URL locale as source of truth
- Create a typed `@booking/i18n` package with feature namespaces and per-render
  i18next instances
- Remove translation JSON and message exports from `@booking/contracts`, leaving
  contracts framework-free and transport-only, then remove related SSR
  externalization workarounds that are no longer necessary
- Require Vietnamese and English namespaces to have matching typed key shapes,
  locale-aware pluralization, and shared date/number/currency formatters
- Remove hard-coded locale arguments and avoid sentence construction from
  separately translated fragments
- Keep locale cookies as a preference only for the legacy root redirect
- Add locale-aware language switching that supports translated slugs
- Add vi/en Dashboard namespaces and initialize Dashboard locale from the user
  preference/session while keeping its non-indexed URLs unprefixed
- Add canonical, reciprocal hreflang, x-default, Open Graph, robots, safe JSON-LD,
  tenant favicon, true 404 responses, tenant sitemap, and robots resources
- Mark checkout, account, verification, and generated search/filter pages with
  appropriate noindex rules
- Use permanent 301 redirects for genuinely replaced public URLs and temporary
  redirects only for preference-based navigation
- Generate sitemap indexes when a tenant exceeds 50,000 canonical URLs

Success: initial HTML contains the correct locale and SEO metadata with no
hydration mismatch or soft-404 response.

### Milestone 9: Frontend Containers

- Add root `.dockerignore`
- Add a safe source-packaging command based on `git archive` so `.env`, `.git`,
  caches, build outputs, and local stores cannot enter shared source archives
- Add multi-stage Storefront and Dashboard Dockerfiles using `turbo prune --docker`
- Run production servers as a non-root user with runtime-only secrets
- Add liveness resource routes
- Add a frontend Compose definition and reverse-proxy sample that preserves
  `Host` and forwarding headers
- Pass `API_BASE_URL`, Redis/session settings, and secrets only at container
  runtime; never bake them into build arguments or image layers

Success: both images build, start, return 200 from `/healthz`, and serve SSR HTML.

### Milestone 10: Automated Verification and CI

- Add Vitest unit tests for paths, redirect safety, memberships, API transport,
  runtime parsing, query keys, URL filter normalization, SEO helpers, i18n
  structure, and session storage
- Add route/auth integration tests for refresh rotation and scoped permissions
- Add Playwright smoke flows for Storefront SSR/booking and Dashboard auth/workspace
  navigation
- Add GitHub Actions jobs for install, typecheck, lint, unit tests, production
  build, and focused browser smoke tests
- Add static architecture checks for browser-reachable `.server` imports,
  deprecated router imports/APIs, translation exports in contracts, and missing
  direct workspace dependencies
- Use package-level scripts registered through Turborepo

Success: the full verification pipeline is repeatable locally and in CI.

## Architecture Boundaries

### Route Modules

Route modules own routing concerns: `loader`, `action`, `meta`, headers,
middleware, hydration boundaries, and route-level error boundaries. They call
feature APIs and adapt loader/action data to page components.

### Feature Modules

Feature modules own page components, schemas, browser-safe query definitions,
and feature-specific helpers. Browser-reachable modules never import `.server`
files. New feature barrels are avoided; consumers import focused modules.

### Server Modules

Files ending in `.server.ts` own cookies, credentials, backend calls, request
contexts, server query functions, and error reporters. They may only be imported
from server-only route exports, middleware, or other server modules.

### Shared Packages

- `@booking/contracts`: framework-free Zod transport schemas and inferred types
- `@booking/api-client`: framework-free Axios transport, isolated client
  factories, and failure modeling
- `@booking/auth`: pure permission and membership predicates
- `@booking/query`: QueryClient construction and React provider only
- `@booking/i18n`: typed resources, formatting, and per-render i18n factories
- `@booking/ui`: reusable visual primitives and composed shared UI

`@booking/contracts` must not export translations. `@booking/ui` continues to
ship raw source via subpath exports and must not grow a catch-all component barrel.

## Authentication Data Flow

1. Root Dashboard middleware reads the signed opaque Dashboard session ID cookie
   and loads its session record from Redis.
2. Missing credentials set the auth context to `null` and continue for public
   routes.
3. Existing credentials call `/auth/session` once.
4. A 401 may trigger exactly one refresh, followed by one session retry.
5. Valid session data and current tokens are stored in Redis and request context;
   they are never serialized into the browser cookie payload.
6. Nested middleware validates active tenant/partner membership from route params.
7. Loaders and actions create scoped Axios request options from only the
   context's access token and scoped IDs.
8. After downstream handlers finish, the root middleware appends a rotated cookie
   unless logout/session effects suppress the commit.

## Error Handling

- Expected validation errors return structured action data.
- Expected missing/forbidden resources throw sanitized 404/403 route responses.
- Invalid upstream response shapes map to 502.
- Network connection failures map to 503.
- Timeouts map to 504.
- Navigation cancellation propagates as cancellation and is not reported.
- Server reporters may log request method, normalized path, route params, status,
  and request ID, but never Cookie, Authorization, password, OTP, or tokens.
- OTP lookup cookies use a dedicated signed name, a short TTL, and are removed
  when consumed or expired; OTP values never appear in browser URLs.

## Test Strategy

Implementation follows red-green-refactor for behavior changes. Configuration-only
changes are verified by the narrowest applicable command and then by production
build. Each milestone includes:

1. A focused failing regression or behavior test where applicable.
2. Minimal implementation to pass.
3. Focused typecheck/test/build for affected packages.
4. Full frontend verification before milestone completion.

The final verification matrix is:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker compose -f docker-compose.frontend.yml build
Playwright Storefront smoke
Playwright Dashboard smoke
source archive content audit
```

## Migration and Compatibility Policy

- Existing page behavior and API endpoint shapes are preserved unless a listed bug
  requires correction.
- Legacy unscoped and non-localized URLs use explicit redirects during migration.
- No mass route rename happens without compatibility paths.
- Existing user changes in the dirty worktree are preserved.
- The implementation will not stage or commit unrelated files.
- Dependency upgrades are committed separately from behavioral refactors where
  practical, making failures and rollback boundaries clear.
- Credentials previously distributed in a source archive are treated as exposed;
  rotation is an operational prerequisite performed by the credential owner and
  is never automated by this repository change.

## Completion Criteria

The modernization is complete when all ten milestones meet their success criteria,
both apps run on the React Router 8 baseline, the full frontend verification matrix
passes, no sensitive token is exposed to browser code or dehydrated state, and the
deployment images pass health and SSR smoke checks.
