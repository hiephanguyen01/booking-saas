# Task 2.5 — Reschedule

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §8.4

## Goal
Customers move a booking to a new slot without cancel-and-rebook.

## Scope
- [ ] `POST /public/bookings/:id/reschedule`: policy window, new-slot availability check under the same exclusion guarantees, price-difference handling
- [ ] State machine + history entries; notifications to both sides
- [ ] Partner approval path when the listing is request-to-book

## Definition of Done
- Race-safe: reschedule cannot double-book; price delta (pay more / refund) covered by tests
