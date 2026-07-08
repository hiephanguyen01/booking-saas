# Task 1.11 — Basic promotions

**Phase:** 1 — Studio MVP · **Depends on:** 1.9 · **Design refs:** TONG-QUAN.md §12

## Goal
Tenants create simple discount codes; customers redeem them safely at checkout.

## Scope
- [ ] Codes: `percent` / `fixed`, effective period (starts_at → ends_at), total usage limit, min order amount, scope: site-wide or specific listing; `funded_by = tenant`
- [ ] `POST /public/checkout/validate-promo` → `{discountAmount, finalAmount}`
- [ ] Redemption lifecycle at checkout: **reserved → applied / released** (released returns the usage)
- [ ] Tenant CRUD + usage stats endpoint

## Out of scope (Phase 2)
`funded_by = partner`, campaigns without code, per-customer limits, first-booking-only, partner-created codes.

## Definition of Done
- Promo race test: N requests fighting over the last use → exactly `usage_limit` applied; release path returns usage correctly
