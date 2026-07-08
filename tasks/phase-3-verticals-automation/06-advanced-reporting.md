# Task 3.6 — Advanced reporting

**Phase:** 3 — Verticals & Automation · **Design refs:** TONG-QUAN.md §13, §21

## Goal
Decision-grade analytics for tenants and platform.

## Scope
- [ ] Tenant reports: revenue by listing type/partner/period, occupancy/utilization, promo effectiveness, cancellation/no-show trends
- [ ] Platform reports: GMV, take rate, cohort retention of tenants
- [ ] Export (CSV) + scheduled email digests
- [ ] Sourced from ledger + bookings (single source of truth — no parallel counters)

## Definition of Done
- Report totals reconcile exactly with ledger; heavy queries don't degrade the transactional path (read replicas or materialized views decided here)
