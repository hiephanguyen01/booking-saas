# ADR 0003 — Transactional outbox for inter-module communication

**Status:** Accepted (documented 2026-07-17).

## Context

The API has 13 bounded contexts. Letting them call each other's services directly would couple them,
create circular dependencies, and make a state change + its side effects non-atomic (the write commits
but the notification fails, or vice-versa).

## Decision

A module's **write-path side effects** reach other modules only via a **transactional outbox**:

- Producer writes the event **in the same transaction** as its state change:
  `OutboxService.emit(tx, { tenantId?, eventType, payload })` inserts into `outbox_events`.
- Consumer registers `OutboxHandlerRegistry.register(eventType, handler)` (in `onModuleInit`).
- A BullMQ relay (`shared/outbox/outbox-relay.worker.ts`) polls every 2s, claims a batch of 20 with
  `FOR UPDATE SKIP LOCKED`, and dispatches each handler inside the event's tenant context. Retries use
  exponential backoff capped at 300s. After 20 failed attempts the relay sets `dead_lettered_at`;
  parked rows are excluded from later claims. Timing uses the **DB clock** (`now()`), never
  `Date.now()`.

## What this does NOT forbid (clarified 2026-07-27)

This ADR was long summarised as "modules never import each other's code". Taken literally that was
never true and never enforced — the code carried ~236 cross-module imports, most of them unavoidable.
The rule is about **atomicity of a state change and its side effects**, so the real boundary is:

| Allowed | Forbidden |
| --- | --- |
| Guards, decorators and Nest modules from `identity-access` / `tenancy` (they are framework here) | Reaching into another module's `infrastructure/` |
| Injecting another module's use-case or repository **port** for a synchronous read | A `domain/` layer importing another module's `application/` (eslint) |
| Importing another module's `domain/` types and pure functions | **Any cycle in the module graph** (the module-cycle guard in `pnpm test`) |
| | Calling another module directly to *cause* a state change — that is what `emit()` is for |

Logic that two contexts genuinely share is not "one module importing another" — it belongs in
`apps/api/src/shared/domain/*`. Three such kernels were extracted on 2026-07-27 (`pricing/` from
listing, `availability/` from scheduling, `commission/` from finance), which removed the two cycles
that had formed (`catalog → listing → catalog` and `catalog → scheduling → listing → catalog`).

## Consequences

- State change and event commit or roll back together — no lost or phantom events.
- Modules stay decoupled; a new consumer is added without touching the producer.
- The module import graph is a DAG, enforced in CI by the module-cycle guard. Cycles are fixed by
  extracting the shared logic to `shared/domain/*` or inverting the dependency behind a port —
  **never** with `forwardRef()`.
- The `outbox_events.aggregate_type`/`aggregate_id` columns exist but are currently unpopulated by
  `emit()`. The API method is `emit` / registry `register` — not the `enqueue`/`.on` some older docs
  showed.
