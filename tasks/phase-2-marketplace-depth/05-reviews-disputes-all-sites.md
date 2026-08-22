# Task 2.5 — Reviews and dispute operations across all sites

**Phase:** 2 — Marketplace Depth · **Depends on:** Phase 1 booking completion + settlement disputes · **Design refs:** `TONG-QUAN.md` sections 8.5, 13, 16, 17, 24

## Goal

Replace mock ratings with verified-booking reviews and complete the existing settlement-dispute experience across Storefront, Partner, Tenant, and Platform Admin surfaces.

## Scope

- [ ] Reviews bounded context: one review per completed owned booking, 1–5 rating, content, one Partner reply
- [ ] Hand-written schema/RLS migration and retry-safe listing/group rating aggregates through the outbox
- [ ] Public listing/group review summaries, lists, truthful card ratings, rating filter/sort, and review JSON-LD
- [ ] Customer Account pending/reviewed list and real review submission in Vietnamese/English
- [ ] Partner review workspace with response filters and one-time reply
- [ ] Tenant review oversight with Partner/listing/rating/response/date/search filters
- [ ] Dedicated Partner dispute inbox; enhanced Tenant dispute queue and notifications
- [ ] Platform Admin read-only cross-tenant review and dispute support views
- [ ] New least-privilege review/dispute permissions and idempotent system-role backfill
- [ ] Explicitly keep Affiliate outside review/dispute data access

## Definition of Done

- Every public rating/count is derived from persisted verified-booking reviews; no mock/synthetic rating remains.
- Duplicate customer review and Partner reply races create exactly one row; outbox replay does not double-count.
- Reviews cannot mutate settlement, refund, ledger, payout, or affiliate commission state.
- Dispute opening still locks release; Partner response and Tenant adjudication remain the only financial path.
- Platform Admin can audit across tenants but cannot resolve a Tenant dispute.
- `pnpm test`, lint, typecheck and build pass. Every new use case ships its unit test beside it
  ([ADR 0009](../../docs/decisions/0009-limited-tests-policy.md)); nothing else — no integration or
  e2e suite, no second runner.

