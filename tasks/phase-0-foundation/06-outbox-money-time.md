# Task 0.6 — Outbox pattern + money/time helpers

**Phase:** 0 — Foundation · **Depends on:** 0.4 · **Design refs:** TONG-QUAN.md §5, §17

## Goal
Cross-module communication and money/time primitives are standardized before features rely on them.

## Scope
- [ ] `outbox_events` table; domain events written in the same transaction as state changes
- [ ] BullMQ relay worker: polls outbox, dispatches handlers, marks processed; retry with backoff
- [ ] `shared/money`: VND as integer, format/parse helpers — no floats anywhere
- [ ] `shared/time`: timezone helpers — always UTC in DB, tenant timezone at the edges

## Definition of Done
- A sample event (e.g. `UserRegistered`) flows: transaction → outbox → relay → handler, with a test proving no event loss on handler failure (retry)
