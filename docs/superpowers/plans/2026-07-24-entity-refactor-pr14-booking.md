# PR #14 — Booking aggregate + lifecycle value objects (booking) — Implementation Plan

**Goal:** Refactor the booking write surface (12 write use-cases + scheduler consumer) around one
`Booking` aggregate without changing HTTP responses, outbox payloads/order, transaction boundaries,
clock sources, idempotency choreography, raw `tstzrange` persistence, or concurrency guards.

**Sources already surveyed:** governing spec
`docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md`, HANDOFF §3, and
`docs/refactor/entity-centric-survey.md` §booking. Do not re-survey the module from scratch.

## Global constraints

- No tests (ADR 0005). Verification is API typecheck/lint/build, full turbo suite, `check:rls`, and
  runtime smoke.
- No application services; one exported injectable use-case per file (ADR 0006).
- Entities/value objects are framework-free: no Nest, Prisma, zod, I/O, clock, randomness, or DI.
- Repository methods keep `PrismaTx` first. Read projections/controllers/DTO/contracts/mappers stay
  unchanged.
- All existing `forTenant` boundaries stay exactly where they are. In particular create keeps its
  pre-check → Redis hold → inventory advisory lock → insert → loser re-read choreography.
- `applyTransition` keeps its atomic `WHERE status = from`, GiST mapping, and history insert. Never
  replace it with an unconditional aggregate save.
- Raw SQL inventory predicates, advisory-lock key, calendar exclusion statuses, scheduler scan SQL,
  and `tstzrange` hydration/persistence stay byte-for-byte unchanged except HTTP-error construction.
- Existing mixed clocks are deliberate: create/approve use `utcNow()`; cancel, no-show, completion,
  pickup, and return use `databaseNow(tx)`.
- Outbox event names, payload keys/stringification, omission rules, and order are frozen. Return must
  emit `booking.returned` before `booking.completed`.

## Frozen wire contract

Every migrated error must retain the exact status/code/message/details currently emitted:

| status | code | message/details |
|---:|---|---|
| 403 | `STOREFRONT_SUSPENDED` | `This storefront is not accepting bookings` |
| 400 | `INVALID_RANGE` | `from must be before to` |
| 400 | `SLOT_IN_PAST` | `Cannot book a past slot` |
| 404 | `LISTING_NOT_FOUND` | `Listing not found` |
| 400 | `MODE_NOT_ENABLED` | dynamic `Listing does not enable "${mode}"` |
| 400 | slot-policy code | `The requested slot is outside the listing availability policy` |
| 409 | `PRICE_CHANGED` | existing message + expected/current subtotal details |
| 409 | `OUT_OF_STOCK` | dynamic remaining count |
| 400 | `DEPOSIT_BELOW_TENANT_COMMISSION` | existing three detail keys |
| 400 | `GUEST_INFO_REQUIRED` | `Provide guest details or sign in to book` |
| 409 | `SLOT_HELD` / `SLOT_TAKEN` | existing technical-error messages |
| 404 | `BOOKING_NOT_FOUND` | `Booking not found` |
| 403 | `NOT_OWNED` | `Booking belongs to another partner` |
| 422 | `NO_SHOW_WINDOW_INVALID` | existing dynamic 48-hour message |
| 400 | `INVENTORY_REQUIRES_RETURN` | existing message |
| 409 | `SERVICE_NOT_ENDED` | existing message |
| 409 | `ONSITE_AMOUNT_MISMATCH` | existing dynamic message + two detail keys |
| 400 | `NOT_CONFIRMED` / `NOT_INVENTORY` | existing messages |
| 409 | `BOOKING_STATE_CHANGED` | existing message from the repository |

`BookingTransitionError` deliberately remains a plain `Error`: invalid lifecycle calls currently
reach Nest as an internal error, and turning it into a 4xx `DomainError` would change the wire
contract. All user-facing errors above move to framework-free `DomainError` subclasses.

## Frozen responses and cross-module seams

- Controllers, DTOs, zod contracts, booking mapper, list/history/calendar/stat use-cases, and their
  fat read records are zero-diff.
- Write methods may continue returning `BookingRecord`; the aggregate hydrates only the narrow state
  it needs. This wave does not rewrite read projections.
- Existing sanctioned composed use-cases (tenant resolution, guest resolution, promotions,
  commission, attribution) keep their import paths and positional signatures.
- Promotion rejection moves from Nest exceptions to a byte-identical `PromoRejectionError`; booking
  confirm catches only `PROMO_LIMIT_REACHED` and continues to tolerate it.
- `payment.succeeded` and `refund.completed` handlers must validate tenantId and skip-with-log when
  absent; no `event.tenantId ?? ''`.

## Task 1 — Domain errors and value objects

Create:

- `booking/domain/errors/booking-domain-errors.ts`: the frozen booking errors above.
- `promotions/domain/errors/promo-rejection.error.ts`: `PromoRejectionError` with 409 only for
  `PROMO_LIMIT_REACHED`, otherwise 400, and `message === code`.
- `booking/domain/value-objects/booking-period.value-object.ts`: validates `start < end`, rejects a
  past start using a caller-supplied app-clock, exposes `timeslot` and buffer-expanded
  `blockedPeriod`. Keep the existing `blockedPeriod()` pure function/path intact.
- `booking/domain/value-objects/booking-money.value-object.ts`: pure helpers for discount/final
  amount, commission-deposit guard, cancellation settlement, outstanding onsite amount, and
  additional-charge parsing. Preserve malformed JSONB handling exactly.
- `booking/domain/value-objects/fulfillment-state.value-object.ts`: pickup/return decisions,
  inventory-mode guards, late-fee fallback order, deposit settlement, and the exact late-fee JSONB
  line shape.

Edit `promotions/application/promo-rejection.ts` to keep its public function/path but return the
domain error. No other promotion behavior changes.

Verify API typecheck and commit:
`feat(booking): domain errors và lifecycle value objects`.

## Task 2 — Booking aggregate

Create `booking/domain/entities/booking.entity.ts`.

`Booking.rehydrate(record)` keeps narrow write state only: identity/ownership, status/mode/range,
money and fulfillment amounts, snapshots, promo/customer/listing identifiers, quantity and code.
Methods:

- `assertOwnedBy(partnerId)`
- `transitionTo(to, actor, optional patches)` delegates to the unchanged state-machine and returns
  repository transition intent (`id/from/to/actor/...`), never persists
- `planCancellation(actor, now)` returns transition intent + exact refund percent/amount
- `planConfirmation()` returns `already_confirmed` for confirmed/completed/no_show, otherwise exact
  CAS intent, `wasExpired`, and promo re-reservation data
- `lateSlotRefundAmount()` returns deposit + security deposit without changing status
- `assertNoShowAllowed(now)`
- `planCompletion(now, onsiteAmount, note)` for non-inventory
- `planPickup(now)` returns fulfillment patch without changing booking status
- `planReturn(now, damage, inventory settings)` returns patch + completion intent + settlement
- `planRefundFinalization()` returns null for already-refunded, otherwise transition intent
- `normalisePartnerNote(note)` preserves current pass-through behavior (no new trimming)

The aggregate does not decide DB availability, stock counts, idempotency races, or event delivery.
It never mutates repository state itself. Verify API typecheck and commit:
`feat(booking): Booking aggregate cho lifecycle write-state`.

## Task 3 — Create-booking through domain

Edit only `create-booking.use-case.ts` plus write-port types if necessary:

- Use `BookingPeriod.create(start,end,utcNow())` for range/past validation and blocked period.
- Use aggregate/static booking policies for published/mode, price integrity, remaining stock,
  promo-derived money, deposit/commission coverage, and activation deadline.
- Keep slot-policy schedule I/O and its dynamic code unchanged; only throw the matching domain error.
- Keep random booking-code generation in the use-case.
- Keep promotion/commission/attribution I/O and all snapshots unchanged.
- Keep every transaction/Redis/advisory-lock/idempotency boundary and the insert/transition/outbox
  ordering unchanged.
- Keep insert data and `booking.created` payload exactly unchanged.

Verify API typecheck, inspect the diff specifically for choreography, and commit:
`refactor(booking): create flow qua Booking policies`.

## Task 4 — Lifecycle write paths + repository HTTP cleanup

Wire the aggregate into:

- `apply-partner-transition.ts` and `partner-owned-booking.ts`
- approve, reject, no-show
- cancel, confirm, finalize-refunded
- complete, pick-up, return, update-partner-note
- scheduler transition assertion

Rules:

- `loadOwnedBooking` keeps its path/signature/order and now delegates ownership to the aggregate.
- Confirm keeps the outer SlotTaken catch and fresh second transaction. Its idempotent set is exact.
  Promo catch is specifically `PromoRejectionError` with `code === PROMO_LIMIT_REACHED`.
- Finalize-refunded still returns for missing or already refunded.
- Pickup remains a fulfillment patch only; no status-history row is invented.
- Return patch occurs before CAS completion, and emits the two events in the existing order.
- Scheduler cross-tenant scan SQL and per-row tolerant catch stay unchanged; only the transition
  decision goes through the aggregate.
- `PrismaBookingRepository.applyTransition` throws byte-identical
  `BookingStateChanged` instead of Nest `ConflictException`; all SQL remains unchanged.

Verify API typecheck/lint/build and commit:
`refactor(booking): lifecycle use-cases qua Booking aggregate`.

## Task 5 — Outbox normalization, docs, verification, smoke

- In `booking.module.ts`, add logger-backed `requireTenantId`; both consumers return early on missing
  tenantId. Preserve `skipBookingConfirmation === true` and
  `affectsBookingStatus === false` semantics.
- Update HANDOFF status/next work/debt list, governing spec normalization list, and API CLAUDE module
  list. Record review findings rather than silently changing frozen gaps.
- Run API typecheck/lint/build, full `pnpm turbo lint typecheck build --force`, and
  `pnpm --filter=@booking/api check:rls`.
- Runtime smoke on an isolated API port using existing local infra:
  create/idempotent retry, stock rejection, payment confirmation/replay, partner ownership,
  lifecycle gates, cancellation/refund completion, and missing-tenant consumer behavior where
  practical. Clean smoke rows/config afterwards.
- Final module diff review: zero controller/DTO/contract/mapper/read-side changes; repository SQL
  unchanged; no Nest/Prisma/zod/clock/randomness in entities; outbox payload/order exact.

Commit docs/review as `docs(refactor): chốt booking final review và handoff`, merge the module branch
into `refactor/entity-centric`, and only then continue to finance.
