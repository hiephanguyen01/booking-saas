# React Router 8 Runtime Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and
> superpowers:test-driven-development task-by-task.

**Goal:** Upgrade both frontend applications and shared UI peer contracts from
React Router 7.18.1 to the current React Router 8.0.1 baseline without changing
`apps/api` or the user's Dashboard affiliate work.

**Architecture:** First add source-level regressions for removed v8 APIs and raw
data-request redirects. Then pin the runtime/toolchain baseline, migrate route
module semantics, and verify Storefront, Dashboard, and `@booking/ui` together.

**Tech Stack:** React Router 8.0.1, React/React DOM 19.2.7, Node >=22.22.0,
Vite 7, TypeScript, Vitest, Turborepo, pnpm 10.13.1.

## Execution Status

**Complete — 2026-07-14.** Fresh verification after a frozen-lockfile install:

- `@booking/ui`: typecheck passed.
- Storefront: 5 test files / 19 tests passed; typecheck, lint, and production
  build passed.
- Dashboard: 2 test files / 3 tests passed; typecheck, lint, and production
  build passed.
- Both React Router CLIs report `8.0.1`.
- Compatibility scans find no runtime `react-router-dom` import, deprecated
  `meta({ data })`, or literal `redirect(request.url)` usage.

Non-failing diagnostics remain tracked for later infrastructure cleanup:
Vitest reports macOS `EMFILE` watcher warnings, and Vite reports sourcemap
location warnings for raw `@booking/ui` TSX modules. Neither command failed.

## Constraints

- Preserve `apps/dashboard/app/routes/affiliate/_index.tsx` exactly as found.
- Do not modify `apps/api`.
- Do not add dark mode work.
- Pin all React Router packages to the same exact version.
- Use normalized `url` route arguments for application URL logic.
- Keep raw `request.url` only where distinguishing document/data requests is intentional.
- Keep every intermediate commit buildable or explicitly test-red.

### Task 1: Add v8 Compatibility Regressions

**Files:**
- Modify: `apps/storefront/app/architecture.spec.ts`
- Create: `apps/dashboard/app/react-router-8.spec.ts`
- Modify: `apps/dashboard/package.json`

1. Add a Storefront assertion that scans route modules and rejects
   `meta({ data })`, `meta({ data: alias })`, and imports from
   `react-router-dom`.
2. Add a Dashboard test that rejects the same removed APIs plus literal
   `redirect(request.url`.
3. Add Dashboard `test: "vitest run"` and direct Vitest 3.2 dependency.
4. Run both focused suites. Expected RED: Dashboard tenant meta still reads
   `data`, while auth/admin helpers replay raw `request.url`.

### Task 2: Pin the Runtime Baseline

**Files:**
- Create: `.nvmrc`
- Modify: `package.json`
- Modify: `apps/storefront/package.json`
- Modify: `apps/dashboard/package.json`
- Modify: `packages/ui/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `turbo.json`

1. Write `22.22.0` to `.nvmrc` and set root engine to `>=22.22.0`.
2. In both apps pin `react`, `react-dom`, `@types/react`, and
   `@types/react-dom` to `19.2.7`/`19.2.x`; pin `react-router`,
   `@react-router/node`, `@react-router/serve`, and `@react-router/dev` to
   `8.0.1`; keep Vite 7.
3. Align `@booking/ui` peer/dev React and React Router versions with the same
   baseline.
4. Add `.react-router/**` to Turbo build outputs.
5. Run `pnpm install`, then confirm both CLIs report `8.0.1`.

### Task 3: Migrate Removed and Changed APIs

**Files:**
- Modify: `apps/dashboard/app/routes/admin/tenants/$id.tsx`
- Create: `apps/dashboard/app/lib/navigation.server.ts`
- Create: `apps/dashboard/app/lib/navigation.server.spec.ts`
- Modify: `apps/dashboard/app/lib/auth.server.ts`
- Modify: `apps/dashboard/app/routes/admin/lib/api.server.ts`
- Modify: every loader currently parsing `new URL(request.url)` for application
  search params in both frontend apps

1. Change the tenant meta function from `{ data: d }` to `{ loaderData }`.
2. Test-first `normalizedRequestLocation(request)` against `.data`, `_routes`,
   and `index` internals. Implement it as a short-lived compatibility helper for
   refresh replays; Milestone 3 removes replay redirects entirely.
3. Replace both literal `redirect(request.url, ...)` calls with the helper.
4. For route-level search/host logic, destructure `url` from
   `Route.LoaderArgs`/`Route.ActionArgs` and use `url.searchParams`, `url.host`,
   or `url.protocol`. Do not reconstruct application URLs from raw requests.
5. Confirm no `react-router-dom`, deprecated meta data, or raw replay redirect
   remains through the Task 1 tests and `rg`.

### Task 4: Verify and Commit

Run fresh:

```bash
pnpm --filter @booking/ui typecheck
pnpm --filter @booking/storefront test
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront lint
pnpm --filter @booking/storefront build
pnpm --filter @booking/dashboard test
pnpm --filter @booking/dashboard typecheck
pnpm --filter @booking/dashboard lint
pnpm --filter @booking/dashboard build
```

Expected: all exit 0 on React Router 8.0.1. Record any non-failing sourcemap or
host watcher warnings separately; do not misreport them as clean output.

Commit boundaries:

```text
test(frontend): guard React Router 8 compatibility
chore(frontend): upgrade to React Router 8
fix(frontend): adopt React Router 8 route semantics
docs: record React Router 8 verification
```

After this plan, execute Milestone 3 auth/session before Milestone 5 Axios so
Axios never owns refresh-token coordination; it remains a transport-only client.
