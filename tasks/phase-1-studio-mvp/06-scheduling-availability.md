# Task 1.6 — Scheduling & availability engine

**Phase:** 1 — Studio MVP · **Depends on:** 1.4 · **Design refs:** TONG-QUAN.md §9

## Goal
Correct, fast slot generation for hourly and daily modes.

## Scope
- [ ] Availability rules (weekly patterns) + exceptions (blackouts, one-off blocks) per resource
- [ ] Slot-generation engine: granularity, minDuration, leadTime, buffer, pricing overlay
- [ ] Date-range availability for `daily` mode (check-in/check-out calendar)
- [ ] `GET /public/listings/:id/availability?from=&to=` returning slots or calendar
- [ ] Caching layer + invalidation on booking/block changes

## Definition of Done
- Unit tests cover buffer, exceptions, lead time, DST/timezone edges; availability endpoint p95 within target on seeded data
