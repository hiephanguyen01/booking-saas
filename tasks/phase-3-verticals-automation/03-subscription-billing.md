# Task 3.3 — Automatic subscription billing + dunning

**Phase:** 3 — Verticals & Automation · **Design refs:** TONG-QUAN.md §3 (revenue), §7 (subscriptions)

## Goal
Tenant subscriptions bill themselves through a gateway; failures are chased automatically.

## Scope
- [ ] Recurring billing job per cycle via payment gateway; invoice records
- [ ] Dunning: retry schedule, grace period, notifications, then suspend (storefront "suspended", dashboard read-only — mechanism exists since Phase 1)
- [ ] Upgrade/downgrade with proration policy
- [ ] Admin overrides (comp months, manual invoices)

## Definition of Done
- Simulated failed-payment tenant walks the full dunning path to suspension and recovers on payment
