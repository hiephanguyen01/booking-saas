# Task 2.6 — Manual walk-in bookings

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §8.7

## Goal
Partners record phone/walk-in customers so the calendar reflects reality.

## Scope
- [ ] `POST /partner/bookings`: partner creates a booking on their own resource (customer name/phone, optional email)
- [ ] Payment recorded as external/cash (no gateway) — flows into ledger correctly
- [ ] Same exclusion constraint; shows on master calendar and blocks public slots

## Definition of Done
- Walk-in blocks the slot publicly; finance reports distinguish gateway vs external payments
