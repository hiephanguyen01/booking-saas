# Reviews and Disputes — All-Sites Design

## Goal

Ship a complete trust-and-resolution slice across BookingOS without duplicating the settlement logic that already exists:

- replace the Storefront customer review mock with real booking-backed reviews and ratings;
- expose trustworthy rating aggregates on public listing/group surfaces and search;
- give Partners a dedicated review/reply workspace and a dedicated dispute inbox;
- give Tenants an operational review view and a stronger dispute adjudication queue;
- give Platform Admin read-only cross-tenant support/audit views;
- keep Affiliate unchanged because it has no legitimate review or dispute responsibility.

The source-of-truth distinction is important:

- **Reviews/ratings are new.** `TONG-QUAN.md` section 24 specifies `reviews`, `review_replies`, one review per completed booking, Partner replies, and denormalized rating aggregates.
- **Settlement disputes already exist.** Customer opening, Partner response, Tenant resolution, refund preparation, settlement locking, and the corresponding Storefront/Tenant/Partner UIs are implemented. This project hardens and completes that flow; it does not create a second complaint model.

## Scope decisions

### Review eligibility

- Only an authenticated customer who owns the booking may submit a review.
- The booking must currently be `completed`.
- A booking can produce exactly one review, enforced by a unique database constraint on `booking_id`.
- A settlement dispute and a review are independent. Opening a dispute neither creates nor deletes a review, and a rating never changes refund or ledger decisions.
- The first release is append-only: customers create once; they cannot edit/delete. This avoids aggregate rollback, reply context drift, and moderation/audit ambiguity.
- Rating is an integer from 1 through 5. Content is required, trimmed, 10–2,000 characters.
- The review captures `listing_id`, optional `group_id`, `partner_id`, and `customer_id` from the booking at creation time. These are attribution snapshots and do not move if the listing is regrouped later.

### Partner reply

- The Partner owning the reviewed booking may reply once.
- A reply is required, trimmed, 10–2,000 characters.
- The first release does not support reply edit/delete. The unique constraint on `review_id` makes concurrency deterministic.
- Tenant and Platform Admin can read replies but cannot impersonate the Partner or reply on their behalf.

### Review moderation

- Review hiding, customer edits, appeals, and polymorphic abuse reports are not part of this slice. `TONG-QUAN.md` deliberately places the shared `reports` cluster later.
- Tenant review access is operational/read-only: search, filter, inspect, and follow up outside this module.
- Platform Admin access is cross-tenant read-only for support/audit. It is not a content-moderation mutation surface.

### Dispute boundaries

- “Khiếu nại” in this project means the existing `settlement_disputes` custody workflow, not a generic support ticket.
- One settlement still permits one dispute. An open dispute locks release.
- Partner still responds once. Tenant remains the sole financial adjudicator: release, full refund, or partial refund.
- Platform Admin observes but cannot resolve, because funds and gateway credentials belong to the Tenant.
- This slice keeps evidence as validated text references/notes in the existing JSON array. Private binary evidence requires private object storage and authorized download URLs; it must be a separate follow-up and must never use the current public-read media bucket.

## Role and site matrix

| Surface | Reviews | Disputes | Mutation authority |
| --- | --- | --- | --- |
| Public Storefront | Rating summary, distribution, paginated reviews/replies on standalone listing and group pages; rating filter/sort when data exists | None | None |
| Customer Account | Pending/reviewed booking list, submit review, see Partner reply | Open and track an owned booking dispute | Create own review; open own dispute |
| Partner Dashboard | KPIs, list/filter owned reviews, reply once | Dedicated inbox, filter, respond once | Reply to owned review/dispute |
| Tenant Dashboard | Cross-partner review oversight and KPIs | Queue, filters, response state, deadline/SLA, adjudication | Resolve dispute only |
| Platform Admin | Cross-tenant review oversight | Cross-tenant read-only support/audit | None |
| Affiliate Dashboard | No change | No change | None |

## Data model

### New `reviews` table

| Column | Notes |
| --- | --- |
| `id` | UUIDv7 primary key |
| `tenant_id` | Required; RLS scope |
| `booking_id` | Required and unique; immutable eligibility anchor |
| `listing_id` | Required attribution snapshot |
| `group_id` | Nullable attribution snapshot for grouped listings |
| `partner_id` | Required for Partner-owned queries |
| `customer_id` | Required for Customer-owned queries |
| `rating` | Small integer, database check `1 <= rating <= 5` |
| `content` | Required text |
| `created_at`, `updated_at` | `timestamptz`; update timestamp is retained for standard record shape even though v1 is append-only |

Relations use restrictive deletion for booking/listing/partner/customer audit records. Group deletion may set `group_id` null only if the existing listing/group deletion policy allows it; otherwise use `RESTRICT` consistently. The migration must make the chosen behavior explicit.

Indexes:

- `(tenant_id, created_at DESC)`
- `(partner_id, created_at DESC)`
- `(customer_id, created_at DESC)`
- `(listing_id, created_at DESC)`
- `(group_id, created_at DESC)` where `group_id IS NOT NULL`
- `(tenant_id, rating, created_at DESC)` for dashboard filters

### New `review_replies` table

| Column | Notes |
| --- | --- |
| `id` | UUIDv7 primary key |
| `tenant_id` | Required; RLS scope |
| `review_id` | Required and unique; one reply per review |
| `partner_id` | Required ownership check |
| `author_user_id` | Required audit actor |
| `content` | Required text |
| `created_at`, `updated_at` | `timestamptz` |

Indexes: `(tenant_id, created_at DESC)` and `(partner_id, created_at DESC)`.

### Denormalized aggregates

Add:

- `listings.rating_avg decimal(3,2) NULL`
- `listings.review_count integer NOT NULL DEFAULT 0`
- `listing_groups.review_count integer NOT NULL DEFAULT 0`

`listing_groups.rating_avg` already exists. `booking_count` is not a review count and must not be reused.

The Reviews module emits `review.created` inside the same tenant transaction. The Listing module consumes the outbox event and recomputes absolute `AVG(rating)` and `COUNT(*)` values for the event's listing and optional group before setting the projection. Recomputing makes at-least-once delivery idempotent; incrementing counters from the event would double-count on retry. The consumer uses a dedicated aggregate-reader port/adapter and does not import Reviews module code.

### RLS and migration

- Hand-author the Prisma migration; never use `prisma migrate dev`.
- Enable and force RLS on both new tables.
- Add the standard `tenant_isolation` policy using `current_setting('app.tenant_id', true)`.
- Add rating check constraints and unique constraints in SQL.
- Run Prisma generation and `check:rls` after deployment.
- Existing cross-tenant Platform Admin readers use `prisma.admin` explicitly; tenant/partner/customer/public paths use exactly one `TenantDbService.forTenant()` transaction per business operation.

## API contracts

Create `packages/contracts/src/contracts/review.ts` and export it through the package barrel.

### Core schemas

- `reviewRatingSchema`: integer 1–5.
- `createReviewInputSchema`: `{ bookingId, rating, content }`.
- `replyReviewInputSchema`: `{ content }`.
- `reviewResponseSchema`: safe shared projection with booking/listing/group labels, customer display name, rating/content, reply, and timestamps; never expose customer phone/email.
- `customerReviewItemSchema`: discriminated item for either `pending` completed booking or `reviewed` review.
- `reviewSummarySchema`: `ratingAvg`, `reviewCount`, and counts for stars 1–5.
- Query schemas for public, customer, Partner, Tenant, and Admin audiences. All list endpoints use the repository-standard `page`/`pageSize` pagination.

### Query behavior

- Public: target kind/slug, rating filter, newest/highest/lowest ordering.
- Customer: `status=pending|reviewed`, newest ordering.
- Partner: `responseStatus=all|pending|responded`, rating, listing ID, date range, query string.
- Tenant: Partner ID, response status, rating, listing ID, date range, query string.
- Admin: Tenant ID, rating, response status, date range, query string.

All counts and summaries are computed server-side over the full filtered dataset, never over the current page.

### Dispute contract hardening

Extend the Finance contract with audience-specific dispute query schemas:

- Tenant: status, Partner ID, response status, date range, query string, page/pageSize.
- Partner: status, response status, date range, query string, page/pageSize; Partner ID is forced server-side.
- Admin: Tenant ID, status, date range, query string, page/pageSize.

Do not add raw customer contact data to Partner or Admin response shapes. Keep money as VND digit strings.

## API module architecture

Add a `reviews` bounded context with the standard shape:

```text
apps/api/src/modules/reviews/
  domain/ports/
  application/use-cases/
  application/review.mapper.ts
  infrastructure/repositories/
  infrastructure/http/dto/
  infrastructure/http/{public,customer,partner,tenant,admin}-review.controller.ts
  infrastructure/http/reviews.module.ts
```

Request flow stays `controller -> use-case -> repository port -> repository`. There are no application service classes. Every use-case file exports one injectable class with one public `execute()`.

Minimum use-cases:

- `CreateReviewUseCase`
- `ListCustomerReviewsUseCase`
- `ListPublicReviewsUseCase`
- `ListPartnerReviewsUseCase`
- `ReplyReviewUseCase`
- `ListTenantReviewsUseCase`
- `ListAdminReviewsUseCase`
- `GetReviewSummaryUseCase` if summary cannot be returned alongside list without weakening repository boundaries
- Listing-side `RefreshReviewAggregateUseCase`, triggered only by `review.created`

Repository writes use compare/unique constraints to make duplicate submissions and concurrent replies deterministic. Prisma errors are translated into domain HTTP errors such as `REVIEW_ALREADY_EXISTS` and `REVIEW_REPLY_ALREADY_EXISTS`; raw Prisma errors never cross the controller boundary.

## Endpoint map and permissions

| Endpoint | Guard |
| --- | --- |
| `GET /public/reviews` | `@Public()`; host resolves tenant; target must be published |
| `GET /customer/reviews` | `@AuthenticatedOnly()`; owned rows only |
| `POST /customer/reviews` | `@AuthenticatedOnly()`; owned completed booking only |
| `GET /partner/reviews` | `partner.reviews.read` |
| `POST /partner/reviews/:id/reply` | `partner.reviews.reply` |
| `GET /tenant/reviews` | `tenant.reviews.read` |
| `GET /admin/reviews` | `platform.reviews.read` |
| Existing Tenant dispute list/resolve | migrate to `tenant.disputes.read` / `tenant.disputes.resolve` |
| Existing Partner dispute list/respond | migrate to `partner.disputes.read` / `partner.disputes.respond` |
| New `GET /admin/disputes` | `platform.disputes.read` |

Update the permission catalog and system roles:

- Super Admin receives both platform permissions; Support receives both read permissions.
- Tenant Owner/Manager receive review read and dispute read/resolve; Finance receives dispute read/resolve.
- Partner Owner receives review read/reply and dispute read/respond; Staff receives dispute read/respond only if the owner wants operational staff handling claims. The default design grants these dispute permissions to Staff because Staff already updates bookings, but not review reply authority.

Existing installations need an idempotent permission backfill, not only a seed-file change.

## Events and notifications

### New review events

- `review.created`: update listing/group aggregates; email the Partner with a Dashboard deep link.
- `review.replied`: email the Customer with the localized Account Reviews deep link.
- The existing `booking.completed` customer email gains a localized Account Reviews link; no duplicate “review invitation” event is necessary.

### Completed dispute events

Emit inside the same transaction:

- `settlement.dispute_opened` from `OpenSettlementDisputeUseCase`.
- `settlement.dispute_responded` from `RespondSettlementDisputeUseCase`.
- `settlement.dispute_resolved` from `ResolveSettlementDisputeUseCase`, alongside the existing release/refund request event.

Notification routing:

- opened -> Partner and Tenant financial operators;
- responded -> Tenant financial operators;
- resolved -> Customer and Partner.

Notification delivery remains idempotent through deterministic dedupe keys. Adding a Tenant audience requires recipient resolution from tenant role assignments with the relevant dispute permission; do not hardcode an owner email.

## Storefront

### Customer Account Reviews

Replace `apps/storefront/app/routes/account/reviews.tsx` mock behavior with:

- authenticated server loader calling `GET /customer/reviews`;
- GET filter form backed by URL search params;
- real pending and reviewed cards;
- inline `useFetcher` review submission so one card submits without navigating the entire page;
- typed action validation using the shared Zod contract;
- action errors next to the relevant card and server-driven revalidation after success;
- bilingual Vietnamese/English strings in `@booking/i18n`;
- real empty/error/pagination states and no `DemoNotice`/`MockDisabledState`.

The booking detail page shows an eligibility CTA but the Account Reviews route remains the canonical composer. The route must preserve the user's existing uncommitted changes in `account/booking-detail.tsx` during implementation.

### Public listing and group pages

- Fetch review summary and the first page in the route loader, server-to-server.
- Standalone listing page shows listing-only reviews.
- Group page shows the group aggregate and reviews across captured child listings, including the child listing title on each card.
- A grouped child listing detail shows its own listing aggregate, not the whole group, plus a link back to the group.
- Render distribution bars, verified-booking label, Partner reply, newest/highest/lowest sort, and pagination.
- Add `AggregateRating` JSON-LD only when `reviewCount > 0`.
- Never synthesize stars or counts when there are no reviews.

### Catalog/search

- Add `ratingAvg` and `reviewCount` to truthful public card/search projections.
- Enable minimum-rating filtering and rating-desc sorting only after the database projection and server query are live.
- Keep available sort/filter capabilities API-driven as required by the existing search design.

## Dashboard

### Partner

Add `/partner/reviews`:

- average rating, total reviews, unanswered reviews;
- URL-driven filters and pagination;
- listing/customer-safe booking context;
- inline one-time reply via `useFetcher` or a route action with independent pending state;
- deep links to the owned listing/group and booking where permitted.

Add `/partner/disputes` and move the existing dispute section/data fetch/action out of `/partner/revenue`. The Revenue page remains finance summary, settlements, ledger, and payouts. The dedicated inbox adds status/response/date/search filters and clear deadlines/resolution outcomes.

### Tenant

Add `/tenant/reviews` as read-only oversight with aggregate KPIs and Partner/listing/rating/response/date/search filters.

Keep `/tenant/finance/disputes` as the canonical financial route to avoid breaking links, but expose it prominently in navigation. Enhance it with URL-driven filters, response status, deadline/SLA indicators, resolution confirmation, and clearer partial-refund bounds.

### Platform Admin

Add `/admin/reviews` and `/admin/disputes` under a “Trust & Support” navigation section. Both are cross-tenant read-only and must show Tenant context. Admin dispute rows link to Admin settlement/Tenant detail views, not Tenant-only route URLs.

### Affiliate

No routes, navigation, APIs, or copied data. Affiliate commission clawback remains visible only through the existing affiliate commission lifecycle. Booking reviews/disputes contain customer and Partner operational context that Affiliates must not receive.

## Performance and consistency

- Public list queries select replies in the same query and use bounded pagination; do not run one reply query per review.
- Dashboard summaries use aggregate queries over the full filter, not in-memory reduction of the page.
- Review creation and outbox emission share one tenant transaction.
- Aggregate refresh sets absolute values and is retry-safe.
- Public search orders by the denormalized columns and uses matching indexes.
- Cross-tenant Admin pages use bounded pagination and indexed filters.

## Out of scope

- Customer review edit/delete.
- Partner reply edit/delete.
- Review moderation/hiding and abuse reports.
- Generic support tickets or chat.
- Automated dispute SLA escalation and Partner penalties.
- Private binary dispute evidence. This requires private storage, authorization-aware signed downloads, retention, and malware handling.
- Affiliate review/dispute access.
- Mobile apps.

## Verification

Repository policy forbids tests. Verify with:

- `pnpm --filter=@booking/contracts build`
- `pnpm --filter=@booking/api prisma:generate`
- `pnpm --filter=@booking/api check:rls`
- `pnpm turbo lint typecheck build`
- running local infrastructure, deploying the hand-written migration, and seeding review/dispute demo rows;
- browser inspection at desktop and mobile for Vietnamese and English Storefront routes;
- browser inspection for Platform Admin, Tenant Owner, Partner Owner, Partner Staff, and Affiliate to confirm both intended access and intended absence;
- manual concurrency checks for two review submissions and two Partner replies, confirming exactly one row succeeds and aggregates remain correct after replaying the outbox event;
- manual money-lifecycle checks confirming review actions never touch settlement/ledger state and a dispute still locks release until Tenant resolution.

