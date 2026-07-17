# ADR 0003 — Transactional outbox for inter-module communication

**Status:** Accepted (documented 2026-07-17).

## Context

The API has 13 bounded contexts. Letting them call each other's services directly would couple them,
create circular dependencies, and make a state change + its side effects non-atomic (the write commits
but the notification fails, or vice-versa).

## Decision

Modules communicate only via a **transactional outbox**:

- Producer writes the event **in the same transaction** as its state change:
  `OutboxService.emit(tx, { tenantId?, eventType, payload })` inserts into `outbox_events`.
- Consumer registers `OutboxHandlerRegistry.register(eventType, handler)` (in `onModuleInit`).
- A BullMQ relay (`shared/outbox/outbox-relay.worker.ts`) polls every 2s, claims a batch of 20 with
  `FOR UPDATE SKIP LOCKED`, and dispatches each handler inside the event's tenant context. Retries use
  exponential backoff capped at 300s. Timing uses the **DB clock** (`now()`), never `Date.now()`.

## Consequences

- State change and event commit or roll back together — no lost or phantom events.
- Modules stay decoupled; a new consumer is added without touching the producer.
- **Known gaps (intentional-for-now):** there is no dead-letter queue — a permanently failing event
  retries forever with capped backoff. The `outbox_events.aggregate_type`/`aggregate_id` columns exist
  but are currently unpopulated by `emit()`. The API method is `emit` / registry `register` — not the
  `enqueue`/`.on` some older docs showed.
