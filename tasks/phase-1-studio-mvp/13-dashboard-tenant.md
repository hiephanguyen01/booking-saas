# Task 1.13 — Dashboard: tenant area

**Phase:** 1 — Studio MVP · **Depends on:** 1.5, 1.10, 1.11 · **Design refs:** TONG-QUAN.md §21 (roadmap item 8)

## Goal
Tenant staff run their marketplace day-to-day from one place.

## Scope
- [ ] Listings management + approval queue (checklist + contact-info scan results)
- [ ] Bookings overview; partner cancellation/no-show rates
- [ ] Finance screens: balances, journals, manual payouts
- [ ] Promotions CRUD + stats
- [ ] Theme & domain settings (`PUT /tenant/theme`, `CRUD /tenant/domains`)

## Definition of Done
- A tenant admin can approve a listing, watch a booking come in, and pay out a partner without touching the DB
