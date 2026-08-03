# Deprecated / dead artifacts

Things that exist in the repo but are **dead or unused**. They are documented here so agents don't
mistake them for live patterns or extend them. Do **not** build on any of these; if you touch adjacent
code and the owner has signed off, they're safe to remove.

## Removed on 2026-07-27

The following were verified to have zero consumers and **deleted**. Listed here so a stale reference
in an older doc, ticket, or snippet is recognisable as history rather than something to restore.

| Artifact | What it was |
| --- | --- |
| `packages/shared/` | A build-output-only directory (`.turbo/`, `dist/`, `node_modules/`) with no `package.json` or `src/`. Never git-tracked; superseded by `@booking/contracts`. |
| `@booking/query` (`packages/query`) | TanStack Query client + provider. Its last consumer (a dashboard browser-side booking fetch) became a server loader on 2026-07-17. |
| `@booking/config` (`packages/config`) | Shared tsconfig/eslint/prettier/tailwind/vite presets. Never adopted — apps hand-roll their configs — and its `vite/react.ts` resolved the `~` alias relative to the config package itself. |
| `@booking/auth` → `src/token.ts` | `decodeJwtPayload` / `isTokenExpired` / `getTokenSubject`. JWT helpers that could never decode a real session token — auth is opaque sessions ([ADR 0001](./decisions/0001-opaque-sessions-over-jwt.md)). Only `permission.ts` was ever imported. |
| `packages/ui/src/index.ts` + the `"."` export | A barrel exporting `cn`. Apps import via subpaths (`@booking/ui/lib/utils`, `@booking/ui/components/*`). |
| `markNoShowInputSchema` / `MarkNoShowInput` (`contracts/booking.ts`) | Back-compat alias of `reasonInputSchema`, zero importers. |
| `totalEarned` (`contracts/affiliate.ts`, `affiliate.mapper.ts`) | `confirmed + paid` collapsed into one number. The tenant affiliate pages read the `pending`/`confirmed`/`paid` split, so nothing consumed it. |
| `targetType` on `contentReportResponseSchema` | A wire alias duplicating `target`. **Note:** `targetType` remains valid as the *Prisma column name* in the content-reports repository and as an audit-log payload key — those are not the same thing. |

## Still live but questionable

| Artifact | What it is | Why it's flagged | Recommendation |
| --- | --- | --- | --- |
| 17 unused `packages/ui/src/components/ui/*` primitives | `aspect-ratio`, `bubble`, `button-group`, `combobox`, `context-menu`, `direction`, `hover-card`, `item`, `kbd`, `marker`, `menubar`, `message`, `message-scroller`, `navigation-menu`, `resizable`, `scroll-area`, `slider` | Zero importers anywhere. Kept deliberately as ready-to-use registry copies, not deleted. | Keep. Deleting them would orphan `@base-ui/react`, `@shadcn/react`, `react-resizable-panels`. |
| `skills-lock.json` (root) | Lockfile listing 24 skill names | Only 6 skills are vendored under `.agents/skills/` (5 symlinked into `.claude/skills/`). The lock is a stale superset. | Regenerate to match, or remove. |
| `apps/api/prisma/migrations/20260708000001_rls_roles_policies/migration.sql` line ~34 | Comment pointing at the removed `test/rls-coverage.integration.spec.ts` | Stale, but the file is an **applied** migration: its sha256 is recorded in `_prisma_migrations.checksum`, and editing even a comment breaks that match. | **Leave as-is.** Not worth a checksum drift. |

## Notes

- `README.md` line ~33 ("Phase 0: demo stub" for storefront tenant resolution) is stale —
  `tenant.server.ts` now does a real backend lookup. Not "dead", just out of date; the README is the
  owner's, so it's left as-is.
- The design spec `TONG-QUAN.md` §22 "Testing Strategy" is superseded by the no-tests policy
  ([ADR 0005](./decisions/0005-no-tests-policy.md)) but kept for historical/product context.
- `TONG-QUAN.md` and `tasks/phase-0-foundation/02-shared-packages.md` still describe
  `@booking/query` / `@booking/config` / `@booking/shared` as planned packages. They are historical
  planning docs — the code above is what shipped.

## Removed on 2026-08-03

Verified to have zero consumers anywhere in either frontend, and **deleted**.

| Artifact | What it was |
| --- | --- |
| `requireData` / `unwrapList` (`dashboard/lib/api.server.ts`) | Sibling helpers of `unwrapApiResult`, documented alongside it in `conventions.md` and the dashboard `CLAUDE.md`. Only `unwrapApiResult` was ever called (5 sites); the other two never were. Docs updated to match. |
| `ListingGroupOverviewCard` (`partner/components/listing-groups/listing-group-summary.tsx`) | Orphaned by the listing-creation rework (`2645d680`). `ListingGroupContentCard`, in the same file, is still live. |
| `findTenantMembership` / `findPartnerMembership` (`dashboard/lib/workspace.ts`) | Superseded by `firstTenantMembership` / `firstPartnerMembership`, which every caller uses. |
| `createMemoryDashboardSessionStore` (`dashboard/lib/session-store.server.ts`) | An in-memory session store. Sessions are Redis-backed; the memory variant had no wiring and no consumer. |
| `formatPercent` (`dashboard/lib/format.ts`) | Plus its module-local `percentFmt`. `formatRate` covers the live case. |
| `firstFormErrorField` (`dashboard/lib/form-errors.ts`) | Replaced by `FormSectionMap.getFirstErrorSection`, which maps the field to its section in one step. |
| `withSearchContext` (`storefront/features/search/lib/search-state.ts`) | Callers build the URL from `searchContextParams` directly. |

### Not removed, but over-exported

These are **live** (used inside their own module) yet exported with no external consumer, so the
`export` keyword overstates the module's surface: `listing-mode-config.ts` (`num`, `optInt`, `optVnd`,
`ModeConfigMap`, `readPackages`, `writePackages`), `lib/pagination.ts` (`FilterPatch`, `parsePage`,
`patchSearchParams`, `ListParams`, `ReadListParamsOptions`). Narrowing them is safe — the compiler
catches any real use — but it is an API-surface change, not dead-code removal.

The 17 unused `packages/ui` primitives listed above remain deliberate.
