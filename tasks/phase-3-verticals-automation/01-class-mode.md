# Task 3.1 — Class mode (sessions & capacity)

**Phase:** 3 — Verticals & Automation · **Design refs:** TONG-QUAN.md §9.5, §16

## Goal
Classes/sessions with seat capacity — third vertical (`classes` template).

## Scope
- [ ] `class` mode: session schedule, capacity, seats-remaining; book multiple seats in one booking
- [ ] Availability = capacity minus booked seats (race-safe under concurrency)
- [ ] `classes` storefront template: session calendar, seat count, multi-seat checkout
- [ ] Cancellation/refund per seat

## Definition of Done
- Seat race test: N parallel bookings for the last seats → never oversold; classes template runs the full journey
