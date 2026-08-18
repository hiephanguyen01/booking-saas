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
| 16 unused `packages/ui/src/components/ui/*` primitives | `aspect-ratio`, `bubble`, `button-group`, `combobox`, `context-menu`, `direction`, `hover-card`, `item`, `kbd`, `marker`, `menubar`, `message`, `message-scroller`, `navigation-menu`, `resizable`, `slider` | Zero importers anywhere. Kept deliberately as ready-to-use registry copies, not deleted. (`scroll-area` was on this list until 2026-08-18, when the dashboard notification bell adopted it — the list is only true until a primitive is picked up, so re-check before citing it.) | Keep. Deleting them would orphan `@base-ui/react`, `@shadcn/react`, `react-resizable-panels`. |
| `apps/api/prisma/migrations/20260708000001_rls_roles_policies/migration.sql` line ~34 | Comment pointing at the removed `test/rls-coverage.integration.spec.ts` | Stale, but the file is an **applied** migration: its sha256 is recorded in `_prisma_migrations.checksum`, and editing even a comment breaks that match. | **Leave as-is.** Not worth a checksum drift. |

## Notes

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

## Removed on 2026-08-04

| Artifact | Why |
| --- | --- |
| `--sf-accent-soft`, `--sf-primary-soft` (`storefront/lib/theme.ts`) | Emitted into every tenant's `:root` block since the theme system was written, read by nothing in either frontend. `--sf-accent` and `--sf-accent-foreground` stay: both are also emitted by the dashboard's `tenant-brand.ts`, and one tenant config has to make one brand in both apps. |
| `--sf-canvas`, `--sf-muted`, `--sf-primary`, `--sf-background` (`storefront/app.css`) | Colour defaults that restated `BRAND_DEFAULTS`, so the same value lived in two places — including a hand-computed accent foreground that would have gone quietly wrong the moment the default accent changed. `themeCss()` is now the only source; the one `--sf-background` consumer moved to the semantic `bg-background`. |

### Not removed, but over-exported

These are **live** (used inside their own module) yet exported with no external consumer, so the
`export` keyword overstates the module's surface: `listing-mode-config.ts` (`num`, `optInt`, `optVnd`,
`ModeConfigMap`, `readPackages`, `writePackages`), `lib/pagination.ts` (`FilterPatch`, `parsePage`,
`patchSearchParams`, `ListParams`, `ReadListParamsOptions`). Narrowing them is safe — the compiler
catches any real use — but it is an API-surface change, not dead-code removal.

The unused `packages/ui` primitives listed above remain deliberate.

## Removed on 2026-08-18

Found by scanning every exported symbol in `apps/*/src|app` and `packages/*/src` for references
across the source **plus `prisma/seed/` and `scripts/`** (so seed-only helpers were not mistaken for
dead code). Everything below had exactly one occurrence repo-wide — its own declaration.

| Artifact | What it was |
| --- | --- |
| `canTransition` (`booking/domain/booking-state-machine.ts`) | Predicate over the same `EDGES` table `assertTransition` walks. Callers always want the throw, never the boolean. |
| `hasCapacity` (`booking/domain/inventory-stock.ts`) | Stock fit check. `remainingStock`, in the same file, is the live one; the module comment now describes it. |
| `TenantAccount`, `isBalanced` (`finance/domain/ledger-journal.ts`) | A `'cash' \| 'revenue'` alias no leg type referenced, and a balance assertion superseded by `withTenantResidual`, which makes a journal balance by construction. |
| `ListingHasPendingRevision` (`listing/domain/errors/listing-revision-errors.ts`) | A `DomainError` never thrown. The pending-revision guard it was written for is not wired ([ADR 0007](./decisions/0007-listing-edit-revisions.md) parks the edit instead of blocking). |
| `PromoRedemptionStatus` (`promotions/domain/ports/promo-redemption-repository.port.ts`) | Status union no port method took or returned. |
| `HardLimitResource` (`tenancy/domain/plan-limits.ts`) | `'maxPartners' \| 'maxListings'` alias; `HardLimitCheck` carries no such field. |
| `TENANT_SHARE_FLOOR_CODE` (`shared/domain/commission/commission-rate-guard.ts`) | Named the code `'COMMISSION_RATES_NEGATIVE_TENANT'`. **The literal is still spelled out** in `finance-domain-errors.ts`, `affiliate-errors.ts` and the dashboard's `tenant-detail-actions.server.ts` — the const was an unrealised single-source-of-truth, never an import. |
| `HOUSEHOLD_REVENUE_THRESHOLD_CODE` (`shared/domain/tax/threshold.ts`) | Same shape: `'household_annual_revenue'` stays literal in `prisma-partner-tax.repository.ts` and the seed. |
| `ApiErrorResponses` + `shared/openapi/dto.ts` (`ApiErrorDto`) | A Swagger decorator documenting 400/401/403/404 that no controller applied. Its only consumer gone, `dto.ts` held nothing else and was deleted whole. |
| `fetchListings` (`storefront/features/catalog/server/catalog.server.ts`) | Mapped catalog items to `PublicListingResponse`. `fetchDiscoveryListings`, its sibling, is what every loader calls — it keeps the sale/price-unit metadata this one dropped. |
| `usePwa` (`storefront/features/pwa/lib/pwa-context.ts`) | The context hook. `PwaContext` itself stays: `pwa-provider.tsx` renders the Provider and reads its value directly. |
| `SiteHeaderLogoutForm` (`storefront/features/site-shell/components/site-header-account-menu.tsx`) | Orphaned when the menu moved its logout into `useSiteHeaderAccountMenuController` (`fetcher` + `logoutAction`), which the menu now renders inline. |
| `OVERLAY_HEADER_HANDLE`, `BOOKING_DETAIL_MOBILE_CHROME_HANDLE` (`storefront/features/site-shell/lib/site-header-handle.ts`) | Two route handles no route module exported. `HOME_HEADER_HANDLE` supersedes the first (same `overlayHeader`, plus `showPwaInstall`). |
| `attributeSummary` (`storefront/lib/ui.ts`) | Joined attribute values with `·`. Attribute display goes through `specCards` / `AttributeSpecCards`. |
| `TENANT_TAX_CATEGORY_LABELS` (`dashboard/constants/tax.ts`) | Vietnamese labels per `TenantTaxCategory`, rendered by no screen. |
| `ModerationActionResult` (`dashboard/features/tenant/server/moderation-action.server.ts`) | `Awaited<ReturnType<...>>` alias no route imported. |

### Deliberately NOT removed

**~70 `z.infer` types in `packages/contracts`** (`UserStatus`, `BookingAccessGrant`,
`PublicCatalogSort`, `StartCheckoutInput`, the five gateway `*Credentials`, …). Each is the typed half
of a schema that **is** live — `userStatusSchema` has 3 references, `bookingAccessGrantSchema` 7. This
is the *over-exported* category already described above, not dead code: deleting the type while the
schema stays is arbitrary, and a contracts package exists precisely to publish the whole wire
vocabulary. Narrow them only as a deliberate API-surface decision.

The unused `packages/ui` primitives remain deliberate (see above) — 16 now, since `scroll-area` was
adopted by the dashboard notification bell. Two of them, `direction.tsx` and `resizable.tsx`, are the
only files in the repo that nothing imports at all; every other module is reachable.

## Docs removed on 2026-08-18

`docs/superpowers/` held the scratch output of the planning skill: one design spec and one
implementation plan per shipped feature, 74 files and 1.2MB. **Neither `AGENTS.md` nor `CLAUDE.md`
ever referenced the directory** — it was not part of the documented docs graph, and the durable half
of that knowledge had already been distilled into `docs/features/*`, the ADRs and
[`conventions.md`](./conventions.md). Nine of the files still described a file layout that no longer
exists (`apps/storefront/app/templates/…`, deleted long ago), so reading one would have actively
misled an agent about the current structure.

Deleted: every file under `docs/superpowers/` **except the two that are cited from somewhere durable**,
plus `docs/refactor/storefront-convention-HANDOFF.md` (referenced only by itself) and the three
root-level `design-qa*.md` reports (one-off QA write-ups whose "evidence" is screenshot paths inside
another machine's home directory, so nothing in them can be re-checked).

| Kept | Why it survived |
| --- | --- |
| `docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md` | Cited by **source code** — `apps/api/src/shared/domain/domain-error.ts` points at its §2.9 — and by `conventions.md`. |
| `docs/superpowers/plans/2026-08-11-money-flow-results.md` | Cited by `TONG-QUAN.md` §D1 as the money-flow verification record. Its two companion links were rewritten to plain prose so the file no longer points at deleted siblings. |

Two other links into the deleted set were fixed rather than left dangling: the money-flow record's
references to its own plan and follow-up, and the `docs/superpowers/specs/…-reviews-disputes-…`
citation in `tasks/phase-2-marketplace-depth/05-reviews-disputes-all-sites.md`. A relative-link sweep
over the remaining 158 markdown files reports zero broken targets.

**Not a doc, but found during the same sweep:** `.claude/worktrees/in-app-notifications` is a leftover
git worktree (834MB) on `feat/in-app-notifications`, a branch already merged as PR #95. It is
gitignored, so it costs disk rather than repo hygiene; `git worktree remove` clears it.

### Follow-up on 2026-08-18 (full re-check)

| Artifact | What it was |
| --- | --- |
| `FAVICON_ACCEPT` (`packages/ui/.../form/image-upload.tsx`), `FAVICON_UPLOAD_ACCEPT` (`contracts/storage.ts`) | Two copies of a "PNG + `.ico` + WebP" accept list for a **favicon upload field that no longer exists**. The favicon is now derived: the tenant uploads one square PNG/WebP source and `pwa-icon-uploader.tsx` generates the 180/192/512 launcher set, with the 512 doubling as `faviconUrl`. Both constants were unreferenced *and* described an abandoned flow — `TONG-QUAN.md` §16.2 still claimed "favicon accepts `.ico`" because of them, and has been corrected. `DEFAULT_IMAGE_ACCEPT` / `PHOTO_UPLOAD_ACCEPT` are live and stay. |

Missed on the first pass because that sweep scoped deletions to `apps/*` and left `packages/*`
untouched; the re-check covered both.

### Docs removed on 2026-08-18 (second pass)

| Artifact | Why |
| --- | --- |
| `docs/refactor/entity-centric-final-report.md` (directory now empty and gone) | Its "Conventions established" section said so itself: *"The normative rules live in `docs/conventions.md`, `apps/api/CLAUDE.md` and the design spec."* A report restating rules that are normative elsewhere is a second source of truth. Its one piece of unique content — the **measured** cross-module coupling left by the refactor — was folded into [`architecture.md`](./architecture.md) → *Remaining synchronous coupling*, and **re-measured** rather than copied: the July figure of 229 cross-context imports is 322 today (227 sanctioned auth/tenancy seams, 95 business-facing, 0 from any `domain/` layer). The three links from the surviving design spec now point at that section. |
| `pnpm test` / `pnpm --filter=@booking/storefront test` in `README.md` | Not a file, but the same class of trap: the README taught two commands that **do not exist in any package** and that [ADR 0005](./decisions/0005-no-tests-policy.md) forbids. Replaced with the real verification chain. `README.md` also pointed at `app/lib/tenant.server.ts`; the module is `app/lib/server/tenant.server.ts`. |
| 18 stale entries in `skills-lock.json` | The lock listed 24 skills against 6 vendored in `.agents/skills/` — including `vitest`, which the no-tests policy forbids outright. Pruned to exactly the 6 vendored; every surviving entry keeps its original hash. |

**Note:** the "README.md line ~33 is stale" entry under *Notes* above was itself stale — that
sentence had already been rewritten. The README's real defects were the two above.
