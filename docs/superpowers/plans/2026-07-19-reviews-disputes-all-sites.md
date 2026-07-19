# Reviews and Disputes — All-Sites Implementation Plan

> Implement task-by-task. Re-read every listed existing file before editing because the worktree may contain user changes. In particular, `apps/storefront/app/routes/account/booking-detail.tsx` is already modified and must be preserved.

**Goal:** Replace mock reviews with verified-booking ratings and finish the existing settlement-dispute experience across Storefront, Partner, Tenant, and Platform Admin.

**Architecture:** Add a hexagonal Reviews bounded context. Customer/Partner/Tenant/Public reads run inside one RLS-bound tenant transaction; Platform Admin reads use an explicit admin reader. Review creation emits an outbox event, and the Listing module recomputes absolute aggregates so retries are idempotent. Existing Finance dispute money logic remains authoritative and only gains audience-specific filters, events, notifications, and dedicated UIs.

**Tech stack:** NestJS 11, Prisma/Postgres RLS, React Router 8 SSR, React 19, Zod contracts, BullMQ outbox, `@booking/ui`, i18next.

## Global constraints

- Never add tests, test files, test configuration, test scripts, or test commands.
- Backend flow is `controller -> use-case -> repository port -> repository`; no application service classes.
- One use-case per file, one exported injectable class, one public `execute()`.
- Every tenant operation uses exactly one `TenantDbService.forTenant()` call. Never nest it or call it per query.
- Modules communicate through outbox events and never import each other's code.
- Hand-author the migration; never use `prisma migrate dev`.
- Every protected endpoint declares `@RequirePermissions`, `@AuthenticatedOnly`, or `@Public`.
- Frontends call the API only from loaders/actions/server modules. No browser-to-backend requests.
- Dashboard filters use URL search params and server pagination. Storefront remains bilingual.
- Preserve money as VND digit strings and keep review operations entirely outside settlement/ledger mutations.
- Private binary dispute evidence is out of scope; do not place evidence in the public-read media bucket.

---

### Task 1: Shared review contracts and dispute query contracts

**Files:**

- Create: `packages/contracts/src/contracts/review.ts`
- Modify: `packages/contracts/src/contracts/finance.ts`
- Modify: `packages/contracts/src/contracts/listing.ts`
- Modify: `packages/contracts/src/contracts/catalog-search.ts`
- Modify: `packages/contracts/src/index.ts`

**Produces:** One framework-free contract for every review audience, truthful public rating fields, and audience-specific dispute filters.

- [ ] Add `reviewRatingSchema`, `createReviewInputSchema`, and `replyReviewInputSchema`.
- [ ] Add common review/reply response schemas with no customer phone/email.
- [ ] Add a discriminated Customer item schema: `pending` contains an eligible completed booking; `reviewed` contains the persisted review/reply.
- [ ] Add `reviewSummarySchema` with `ratingAvg`, `reviewCount`, and a fixed 1–5 distribution.
- [ ] Add public/customer/Partner/Tenant/Admin query schemas. Extend `paginationQuerySchema`; use enums for sort/status filters and ISO datetime validation for ranges.
- [ ] Add `ratingAvg` and `reviewCount` to public listing/listing-group/card/search response schemas. Do not reuse `bookingCount`.
- [ ] Add `minRating` and rating-desc sort only to API-advertised search capabilities; do not hardcode a frontend-only option.
- [ ] Add `tenantSettlementDisputesQuerySchema`, `partnerSettlementDisputesQuerySchema`, and `adminSettlementDisputesQuerySchema` to Finance contracts.
- [ ] Re-export the new contract file from the package barrel.
- [ ] Build contracts before checking consumers.

**Verification:**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/contracts typecheck
```

Expected: both commands exit 0; generated `dist` exposes the new schemas/types.

### Task 2: Review schema, aggregates, RLS, and permission backfill

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_reviews_and_review_aggregates/migration.sql`
- Modify: `apps/api/src/modules/identity-access/domain/permission-catalog.ts`
- Modify: `apps/api/prisma/seed.ts`

**Produces:** Tenant-isolated review storage, denormalized aggregates, least-privilege permissions, and idempotent installation/backfill behavior.

- [ ] Add Prisma `Review` and `ReviewReply` models with the exact attribution fields from the design.
- [ ] Add model relations to `Tenant`, `Booking`, `Listing`, `ListingGroup`, `Partner`, and `User` without cascading away completed-booking audit history.
- [ ] Add `ratingAvg`/`reviewCount` to `Listing`; add `reviewCount` to `ListingGroup` while retaining its existing `ratingAvg`.
- [ ] Hand-write SQL for tables, FKs, indexes, unique constraints, the `rating BETWEEN 1 AND 5` check, and aggregate columns.
- [ ] Enable and force RLS on `reviews` and `review_replies`; create `tenant_isolation` policies.
- [ ] Add permissions: `platform.reviews.read`, `platform.disputes.read`, `tenant.reviews.read`, `tenant.disputes.read`, `tenant.disputes.resolve`, `partner.reviews.read`, `partner.reviews.reply`, `partner.disputes.read`, `partner.disputes.respond`.
- [ ] Update system-role defaults per the design. Support gets platform read permissions; Finance gets Tenant dispute read/resolve; Partner Staff gets dispute read/respond but not review reply.
- [ ] Include an idempotent SQL/data backfill for existing system roles. Do not rely on rerunning the demo seed in production.
- [ ] Regenerate Prisma and validate static RLS coverage.

**Verification:**

```bash
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api check:rls
```

Expected: all commands exit 0; the RLS checker recognizes both new tenant tables.

### Task 3: Reviews repository ports, records, and audience-safe queries

**Files:**

- Create: `apps/api/src/modules/reviews/domain/ports/review-repository.port.ts`
- Create: `apps/api/src/modules/reviews/domain/ports/admin-review-reader.port.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/repositories/prisma-review.repository.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/repositories/prisma-admin-review.reader.ts`
- Create: `apps/api/src/modules/reviews/application/review.mapper.ts`

**Produces:** Bounded query/write interfaces with no N+1 reply loading and no cross-audience PII leak.

- [ ] Define records for persisted reviews, optional reply, public/customer/dashboard display context, summary, and eligible pending booking.
- [ ] Repository `create` derives listing/group/Partner/customer from the owned completed booking in the same transaction. The use-case never trusts those IDs from input.
- [ ] Use `booking_id` uniqueness as the final duplicate guard; translate the collision later in the use-case layer.
- [ ] Repository `reply` uses an atomic conditional write and verifies the review belongs to the Partner in scope.
- [ ] Public query requires a published target and joins the reply in the same bounded query.
- [ ] Customer query combines completed owned bookings with persisted reviews and paginates/filter-counts at the database level.
- [ ] Partner/Tenant queries apply every filter server-side and return totals/summaries over the full filtered set.
- [ ] Admin reader uses `prisma.admin`, includes Tenant labels, stays read-only, and never returns raw customer contact details.
- [ ] Mapper functions produce exact audience response types; controllers do not map inline.

**Verification:**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

Expected: repository records and mappers compile without importing another module's application/domain code.

### Task 4: Reviews use-cases, controllers, module, and idempotent aggregate projection

**Files:**

- Create: `apps/api/src/modules/reviews/application/use-cases/create-review.use-case.ts`
- Create: `apps/api/src/modules/reviews/application/use-cases/list-customer-reviews.use-case.ts`
- Create: `apps/api/src/modules/reviews/application/use-cases/list-public-reviews.use-case.ts`
- Create: `apps/api/src/modules/reviews/application/use-cases/list-partner-reviews.use-case.ts`
- Create: `apps/api/src/modules/reviews/application/use-cases/reply-review.use-case.ts`
- Create: `apps/api/src/modules/reviews/application/use-cases/list-tenant-reviews.use-case.ts`
- Create: `apps/api/src/modules/reviews/application/use-cases/list-admin-reviews.use-case.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/http/dto/review.dto.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/http/public-review.controller.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/http/customer-review.controller.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/http/partner-review.controller.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/http/tenant-review.controller.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/http/admin-review.controller.ts`
- Create: `apps/api/src/modules/reviews/infrastructure/http/reviews.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/modules/listing/domain/ports/review-aggregate-reader.port.ts`
- Create: `apps/api/src/modules/listing/infrastructure/repositories/prisma-review-aggregate.reader.ts`
- Create: `apps/api/src/modules/listing/application/use-cases/refresh-review-aggregate.use-case.ts`
- Modify: `apps/api/src/modules/listing/domain/ports/listing-repository.port.ts`
- Modify: `apps/api/src/modules/listing/domain/ports/listing-group-repository.port.ts`
- Modify: `apps/api/src/modules/listing/infrastructure/repositories/prisma-listing.repository.ts`
- Modify: `apps/api/src/modules/listing/infrastructure/repositories/prisma-listing-group.repository.ts`
- Modify: `apps/api/src/modules/listing/infrastructure/http/listing.module.ts`

**Produces:** Guarded REST endpoints plus retry-safe public rating projections.

- [ ] Implement each use-case with one `forTenant()` operation, except the explicit Admin read use-case.
- [ ] `CreateReviewUseCase` checks eligibility through the repository, creates once, and emits `review.created` in the same transaction with `reviewId`, `listingId`, and optional `groupId`.
- [ ] Return explicit errors: `REVIEW_BOOKING_NOT_ELIGIBLE`, `REVIEW_ALREADY_EXISTS`, `REVIEW_NOT_FOUND`, `REVIEW_REPLY_ALREADY_EXISTS`.
- [ ] `ReplyReviewUseCase` emits `review.replied` only after the atomic reply succeeds.
- [ ] Add five audience controllers and declare the exact guards/permissions from the design.
- [ ] Resolve public Tenant identity from Host; never accept Tenant ID from a public query.
- [ ] Bind repository ports and register `ReviewsModule` in the app.
- [ ] In the Listing module, register `review.created` with `OutboxHandlerRegistry`.
- [ ] `RefreshReviewAggregateUseCase` recomputes authoritative `AVG/COUNT` for the listing and captured group and sets absolute projection values. It must not increment from payload values.
- [ ] Extend listing/group ports with narrowly scoped aggregate setters rather than exposing raw Prisma access to the use-case.

**Verification:**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

Expected: endpoints appear in Swagger; every route passes the deny-by-default declaration rule.

### Task 5: Public listing/group/search review projections

**Files:**

- Modify: `apps/api/src/modules/listing/domain/ports/listing-repository.port.ts`
- Modify: `apps/api/src/modules/listing/domain/ports/listing-group-repository.port.ts`
- Modify: `apps/api/src/modules/listing/infrastructure/repositories/prisma-listing.repository.ts`
- Modify: `apps/api/src/modules/listing/infrastructure/repositories/prisma-listing-group.repository.ts`
- Modify: `apps/api/src/modules/listing/application/listing.mapper.ts`
- Modify: `apps/api/src/modules/listing/application/use-cases/get-public-listing-group.use-case.ts`
- Modify the existing catalog search port/repository/use-case files that currently produce `PublicListingResponse` and advertised sort/filter capabilities.

**Produces:** Real rating data everywhere the Storefront consumes listing cards or detail payloads.

- [ ] Carry listing/group `ratingAvg` and `reviewCount` through domain records and public mappers.
- [ ] Include group aggregates in `GetPublicListingGroupUseCase`; include child listing aggregates where the UI needs them.
- [ ] Add database-side `minRating` filtering and rating-desc ordering to catalog search.
- [ ] Advertise rating controls only when reviews are enabled by these truthful projections.
- [ ] Add matching indexes if query inspection shows the migration's initial indexes do not cover public sort/filter paths.
- [ ] Ensure zero reviews map to `ratingAvg: null`, `reviewCount: 0`; never map zero reviews to a numeric zero-star average.

**Verification:**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

Expected: public responses contain no synthetic values and catalog pagination totals remain correct with rating filters.

### Task 6: Storefront Customer Account Reviews

**Files:**

- Create: `apps/storefront/app/features/account/server/reviews.server.ts`
- Create: `apps/storefront/app/features/account/components/review-card.tsx`
- Create: `apps/storefront/app/features/account/components/review-composer.tsx`
- Modify: `apps/storefront/app/routes/account/reviews.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-detail-panel.tsx`
- Carefully modify only if required: `apps/storefront/app/routes/account/booking-detail.tsx`
- Modify: `packages/i18n/src/locales/vi/account.ts`
- Modify: `packages/i18n/src/locales/en/account.ts`
- Delete only after references are removed: review-specific records from `apps/storefront/app/features/account/server/mock-data.server.ts`

**Produces:** Real pending/reviewed customer workflow with localized, inline submission.

- [ ] Replace mock gating with an authenticated loader that parses URL filters and calls `GET /customer/reviews` through the Storefront BFF.
- [ ] Add an action that validates `createReviewInputSchema` and calls `POST /customer/reviews` server-to-server.
- [ ] Use `<Form method="get">` for filters and a typed `useFetcher` for each inline review mutation.
- [ ] Render 1–5 keyboard-accessible rating buttons, content validation, independent pending state, field/action errors, and success revalidation.
- [ ] Render pending/reviewed empty states, pagination, verified-booking context, and Partner replies.
- [ ] Add a booking-detail CTA when the loader data says the booking is eligible; route to the canonical Reviews page/composer.
- [ ] Preserve all existing uncommitted changes in `account/booking-detail.tsx`; do not replace the file wholesale.
- [ ] Remove `DemoNotice`, `MockDisabledState`, and fake review data from this route.
- [ ] Complete both Vietnamese and English keys.

**Verification:**

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Expected: review actions run through the route action, never from a browser API call.

### Task 7: Storefront public reviews, cards, filters, and SEO

**Files:**

- Create: `apps/storefront/app/features/reviews/components/review-summary.tsx`
- Create: `apps/storefront/app/features/reviews/components/review-list.tsx`
- Create: `apps/storefront/app/features/reviews/server/reviews.server.ts`
- Modify: `apps/storefront/app/routes/listing.tsx`
- Modify: `apps/storefront/app/routes/listing-group.tsx`
- Modify: `apps/storefront/app/features/listing/listing-page.tsx`
- Modify: `apps/storefront/app/features/listing-group/listing-group-page.tsx`
- Modify: `apps/storefront/app/features/catalog/components/listing-card.tsx`
- Modify: `apps/storefront/app/features/catalog/components/listing-card.types.ts`
- Modify: `apps/storefront/app/features/catalog/components/filter-panel.tsx`
- Modify relevant search state/catalog route files for rating query params.
- Modify: `packages/i18n/src/locales/vi/catalog.ts`
- Modify: `packages/i18n/src/locales/en/catalog.ts`

**Produces:** Public verified reviews on standalone/group pages and truthful rating discovery controls.

- [ ] Fetch summary + review page from the server loader in parallel with existing listing data.
- [ ] Keep review filters/sort in URL search params and preserve booking/search params during navigation.
- [ ] Show child listing title on group-aggregate review cards.
- [ ] Render average, count, 1–5 distribution, Partner reply, sort, pagination, and no-review state.
- [ ] Update cards/search results to show stars only when `reviewCount > 0`.
- [ ] Add minimum-rating filter and rating-desc sort using API-advertised capabilities.
- [ ] Add `AggregateRating` JSON-LD only when reviews exist and ensure the JSON is serialized through the existing safe SEO helper.
- [ ] Inspect mobile layouts for long bilingual content, long Partner replies, and no horizontal overflow.

**Verification:**

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Expected: public pages render entirely from loader data and never fabricate rating data.

### Task 8: Partner reviews workspace and dedicated dispute inbox

**Files:**

- Create: `apps/dashboard/app/routes/partner/reviews.tsx`
- Create: `apps/dashboard/app/routes/partner/disputes.tsx`
- Create: `apps/dashboard/app/features/reviews/components/partner-review-list.tsx`
- Create: `apps/dashboard/app/features/reviews/components/review-reply-form.tsx`
- Create: `apps/dashboard/app/features/reviews/server/partner-reviews.server.ts`
- Create: `apps/dashboard/app/features/finance/components/partner-dispute-list.tsx`
- Create: `apps/dashboard/app/features/finance/server/partner-disputes.server.ts`
- Modify: `apps/dashboard/app/routes/partner/revenue.tsx`
- Modify: `apps/dashboard/app/routes/partner/routes.ts`
- Modify: `apps/dashboard/app/routes/partner/nav.ts`
- Modify: `apps/dashboard/app/constants/paths.ts`

**Produces:** A focused Partner reputation workspace and a claim inbox no longer buried in Revenue.

- [ ] Add typed paths and nested routes for `/partner/reviews` and `/partner/disputes`.
- [ ] Add navigation entries gated by the new permissions.
- [ ] Reviews loader returns average/total/unanswered KPIs plus a server-filtered page.
- [ ] Review action validates `replyReviewInputSchema` and calls the Partner review reply endpoint.
- [ ] Use GET forms for filters and independent fetcher/pending state for replies.
- [ ] Move existing dispute fetch, render, and response action out of `partner/revenue.tsx`; preserve finance summary, settlements, ledger, and payouts there.
- [ ] Add dispute status/response/date/search filters, deadline display, outcome details, pagination, and deep links to owned booking/listing routes.
- [ ] Ensure the Partner projection never exposes raw customer IDs, email, unmasked phone, Tenant resolution actor ID, or internal platform/affiliate amounts.

**Verification:**

```bash
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
```

Expected: Revenue no longer loads disputes; new pages enforce new permissions through both nav visibility and server guards.

### Task 9: Tenant review oversight and dispute queue hardening

**Files:**

- Create: `apps/dashboard/app/routes/tenant/reviews.tsx`
- Create: `apps/dashboard/app/features/reviews/components/tenant-review-table.tsx`
- Create: `apps/dashboard/app/features/reviews/server/tenant-reviews.server.ts`
- Modify: `apps/dashboard/app/routes/tenant/finance/disputes.tsx`
- Modify: `apps/dashboard/app/routes/tenant/routes.ts`
- Modify: `apps/dashboard/app/routes/tenant/nav.ts`
- Modify: `apps/dashboard/app/constants/paths.ts`

**Produces:** Tenant-wide reputation visibility and an operationally useful financial adjudication queue.

- [ ] Add `/tenant/reviews`, path helper, nav entry, and `tenant.reviews.read` guard.
- [ ] Show average/total/unanswered KPIs and Partner/listing/rating/response/date/search filters over server data.
- [ ] Keep review page read-only; do not add hiding/reply impersonation.
- [ ] Upgrade the existing canonical `/tenant/finance/disputes` page rather than creating a competing Tenant dispute route.
- [ ] Parse and forward status/Partner/response/date/search pagination filters.
- [ ] Display overdue/approaching deadline indicators, Partner-response state, remaining held amount, and final outcome.
- [ ] Make resolution confirmation explicit. For partial refund, display and validate the maximum remaining held amount before submission while keeping the backend authoritative.
- [ ] Migrate route guards to `tenant.disputes.read`/`tenant.disputes.resolve` and keep the finance roles backfilled.

**Verification:**

```bash
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
```

Expected: all filtering/pagination is URL- and loader-driven; Tenant remains the only financial resolver.

### Task 10: Platform Admin read-only support views

**Files:**

- Create: `apps/api/src/modules/finance/domain/ports/admin-dispute-reader.port.ts`
- Create: `apps/api/src/modules/finance/infrastructure/repositories/prisma-admin-dispute.reader.ts`
- Create: `apps/api/src/modules/finance/application/use-cases/list-admin-settlement-disputes.use-case.ts`
- Create or extend: `apps/api/src/modules/finance/infrastructure/http/admin-finance.controller.ts`
- Modify: `apps/api/src/modules/finance/infrastructure/http/finance.module.ts`
- Create: `apps/dashboard/app/routes/admin/reviews/_index.tsx`
- Create: `apps/dashboard/app/routes/admin/disputes/_index.tsx`
- Create relevant read-only components under `apps/dashboard/app/features/admin/components/`
- Modify: `apps/dashboard/app/routes/admin/routes.ts`
- Modify: `apps/dashboard/app/routes/admin/nav.ts`
- Modify: `apps/dashboard/app/constants/paths.ts`

**Produces:** Cross-tenant audit/support visibility with no mutation authority.

- [ ] Implement `GET /admin/disputes` through an explicit read-only admin-pool port and `platform.disputes.read`.
- [ ] Reuse the Reviews module Admin endpoint for cross-tenant reviews and `platform.reviews.read`.
- [ ] Add `/admin/reviews` and `/admin/disputes` under a Trust & Support nav group.
- [ ] Show Tenant context and filters; link only to Admin-accessible Tenant/settlement destinations.
- [ ] Do not render resolve/reply/hide controls and do not call Tenant or Partner mutation endpoints from Admin routes.
- [ ] Ensure Admin response shapes contain only the minimum support context and no raw customer contact data.

**Verification:**

```bash
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
```

Expected: Support can inspect; no Platform role can adjudicate a Tenant settlement dispute.

### Task 11: Dispute outbox events and review/dispute notifications

**Files:**

- Modify: `apps/api/src/modules/finance/application/use-cases/open-settlement-dispute.use-case.ts`
- Modify: `apps/api/src/modules/finance/application/use-cases/respond-settlement-dispute.use-case.ts`
- Modify: `apps/api/src/modules/finance/application/use-cases/resolve-settlement-dispute.use-case.ts`
- Modify: `apps/api/src/modules/notification/domain/notification-plan.ts`
- Modify: `apps/api/src/modules/notification/domain/ports/notification-reader.port.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts`
- Add focused review/dispute dispatch use-cases under `apps/api/src/modules/notification/application/use-cases/`
- Modify: `apps/api/src/modules/notification/domain/email-template.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/http/notification.module.ts`

**Produces:** Idempotent actionable emails for review and dispute lifecycle events.

- [ ] Inject `OutboxService` into open/respond dispute use-cases and emit the designed events in the same transaction as the state mutation.
- [ ] Emit `settlement.dispute_resolved` in both release and refund branches without removing the existing release/refund request events.
- [ ] Register handlers for `review.created`, `review.replied`, `settlement.dispute_opened`, `settlement.dispute_responded`, and `settlement.dispute_resolved`.
- [ ] Resolve Tenant recipients from scoped role assignments/permissions, not a hardcoded owner email.
- [ ] Add Vietnamese/English email templates and deep links to the correct Storefront/Dashboard audience route.
- [ ] Add the Account Reviews deep link to the existing `booking.completed` customer email.
- [ ] Use deterministic dedupe keys including event type, aggregate ID, template, and recipient user ID.
- [ ] Keep notifications side-effect-only; failure/retry must never roll back a committed review/dispute state.

**Verification:**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

Expected: replaying a delivered outbox event does not send a duplicate email.

### Task 12: Seed/demo data, documentation, and full manual verification

**Files:**

- Modify: `apps/api/prisma/seed.ts` or the appropriate focused demo seed helper
- Modify: `TONG-QUAN.md`
- Modify: `docs/architecture.md`
- Modify: `docs/data-model.md`
- Modify: `docs/conventions.md` only if a new reusable convention was introduced
- Update completion checkboxes in `tasks/phase-2-marketplace-depth/05-reviews-disputes-all-sites.md`

**Produces:** A reproducible local demo and documentation matching code.

- [ ] Seed at least: one reviewed completed booking with reply, one reviewed booking without reply, one eligible pending review, one open dispute awaiting Partner response, one open dispute with response, and one resolved dispute.
- [ ] Make seed writes idempotent and tenant-correct.
- [ ] Update `TONG-QUAN.md` section 24 so reviews are no longer described as entirely out of scope once implementation lands; document the exact shipped limitations.
- [ ] Document the Reviews bounded context, new tables/RLS, events, endpoints, and all-site surfaces.
- [ ] Deploy the migration locally and run the app with seeded roles.
- [ ] Manually submit the same review twice concurrently; confirm one persisted review and the documented conflict for the other.
- [ ] Manually submit two Partner replies concurrently; confirm one persisted reply.
- [ ] Replay `review.created`; confirm listing/group counts and averages remain unchanged.
- [ ] Confirm a review mutation changes no settlement, refund, ledger, payout, or affiliate-commission row.
- [ ] Confirm a dispute locks settlement release and only Tenant resolution resumes release or prepares refund.
- [ ] Inspect Storefront `/vi` and `/en` account/listing/group/catalog at desktop and 390px mobile.
- [ ] Inspect Partner Owner, Partner Staff, Tenant Owner, Finance, Super Admin, Support, and Affiliate access/absence.
- [ ] Confirm no synthetic ratings, no customer contact leak, and no browser-to-backend request in devtools.

**Final verification:**

```bash
git diff --check
pnpm --filter=@booking/api check:rls
pnpm turbo lint typecheck build
```

Expected: all commands exit 0. No test command is run and no test artifact exists.

## Suggested delivery waves

1. **Foundation:** Tasks 1–4. Contracts, schema/RLS/permissions, Reviews API, aggregate projection.
2. **Public/customer value:** Tasks 5–7. Truthful rating discovery and Customer review submission.
3. **Operations:** Tasks 8–10. Partner, Tenant, and Platform Admin workspaces.
4. **Lifecycle completion:** Tasks 11–12. Notifications, demo data, documentation, and manual verification.

Each wave should pass its listed lint/typecheck/build/RLS gates before the next wave starts.

