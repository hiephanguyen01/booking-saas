# PR #15 — Settlement + Payout + Dispute + CommissionRule (finance) — Implementation Plan

**Goal:** Refactor the finance write surface (18 write use-cases, 8 outbox handlers, 6 produced
events) around `Settlement`, `Payout`, `SettlementDispute`, `CommissionRule`, `LedgerJournal`, and
`PayoutPolicy` without changing HTTP wire contracts, ledger legs, CAS SQL, DB-clock behavior,
transaction boundaries, read projections, or event payloads/order.

**Sources:** HANDOFF §3, governing entity-centric spec, and the precomputed finance section in
`docs/refactor/entity-centric-survey.md`. Do not re-survey unrelated API code.

## Global constraints

- No tests. Verification = typecheck/lint/build/check:rls/runtime smoke.
- No application service classes; one injectable use-case with one public `execute()` per file.
- Domain entities/VOs are framework-free: no Nest/Prisma/zod/I/O/DI/clock/randomness.
- Controllers, DTO/contracts, `finance.mapper.ts`, list/get/read use-cases, and fat read records are
  frozen. Write entities hydrate from structural narrow state while repositories may keep returning
  `*Record`.
- Every existing `forTenant` and admin-pool boundary remains. `ResolveCommissionUseCase` must still
  accept the booking module's shared `PrismaTx`.
- Every settlement/payout/dispute CAS stays in repository SQL:
  `startDisputeWindow`, `prepareRefund`, `finalizeRefund`, `markDisputed`,
  `resolveDisputeForRelease`, `markReleased`, `claimForPayment`, `markPaid`, `markFailed`,
  dispute `respond`/`resolve`. No unconditional aggregate save.
- Settlement DB-clock guards (`dispute_until`, release due), `maturePayable` DB-clock CTE,
  per-payee advisory lock, released-settlement FIFO allocation SQL, commission precedence/timeline
  SQL shadow, ledger balance/immutability triggers, and every repository SQL predicate are zero-diff.
- Bigint money remains bigint; snapshots retain string round-trips; outbox money remains decimal
  strings.
- At-least-once semantics remain exact: missing held settlement must still throw/retry, status
  no-ops remain no-ops, refundId equality and `refund_pending` incremental shortcut remain.

## Frozen exceptions

Migrate only exceptions whose body already has `{statusCode,code,message,details?}` to byte-identical
`DomainError`s. Preserve the three bare Nest exceptions in dispute resolution exactly:

- missing settlement after dispute load: bare `NotFoundException()`
- dispute CAS resolve miss in release branch: bare `ConflictException()`
- dispute CAS resolve miss in refund branch: bare `ConflictException()`

Named errors include the existing exact shapes for `RULE_NOT_FOUND`,
`TENANT_SHARE_FLOOR_VIOLATION`, `COMMISSION_EXCEEDS_PARTNER_DEPOSIT`, `DEFAULT_RULE_LOCKED`,
`NOTHING_TO_PAY`, `BELOW_MINIMUM`, `PAYOUT_ALLOCATION_MISMATCH`, `PAYOUT_NOT_FOUND`,
`PAYOUT_SETTLED`, `PAYOUT_IN_PROGRESS`, `PAYOUT_STATE_CHANGED`, finance booking/settlement missing
variants, `HELD_SETTLEMENT_MISSING`, `ONSITE_AMOUNT_MISMATCH`, `SETTLEMENT_JOURNAL_EXISTS`,
`SETTLEMENT_NOT_RELEASABLE`, tenant/customer dispute errors, `DISPUTE_RESPONSE_NOT_ACCEPTED`,
`DISPUTE_NOT_RESOLVABLE`, `INVALID_REFUND_AMOUNT`, and `PARTIAL_REFUND_MUST_BE_PARTIAL`.

## Task 1 — Errors, PayoutPolicy, LedgerJournal façade

Create:

- `domain/errors/finance-domain-errors.ts` with exact named wire errors.
- `domain/value-objects/payout-policy.value-object.ts`: normalize stored settings exactly as current
  get-policy (holdingDays integer 0..90 else 3; digit minAmount else 0; weekly else monthly), expose
  cycle period derivation with caller-supplied dates.
- `domain/entities/ledger-journal.entity.ts`: framework-free static façade over the existing pure
  builders/idempotency helpers. It must delegate without changing a single journal leg, residual,
  memo, or availableAt rule.

Wire `GetPayoutPolicyUseCase` to `PayoutPolicy.fromStored`; update-policy remains a settings merge
with the same bare NotFound. Verify API typecheck and commit.

## Task 2 — CommissionRule aggregate

Create `domain/entities/commission-rule.entity.ts`.

- `create(input, platformRate, isHouse)` converts strings/dates and enforces tenant-share floor.
- `rehydrate(record)` stores narrow state.
- `proposeUpdate(input,isHouse)` preserves tri-state fields, inherits platformRate, revalidates
  merged state, and returns both the full candidate for deposit-coverage SQL and partial write data.
- `withPlatformRate(rate,isHouse)` validates the merged floor.
- `assertDeletable()` protects tenant default.
- Deposit incompatibility remains repository SQL; entity/static helper only maps its returned
  count/samples to the exact error.

Wire create/update/delete/set-platform-rate. Preserve query order, house-partner lookup, platformRate
inheritance, and the provider-only/no-route status of set-platform-rate. Repository is zero-diff.
Verify and commit.

## Task 3 — Settlement aggregate

Create `domain/entities/settlement.entity.ts` with narrow custody state and methods:

- `startCompletionWindow(booking, reportedOnsite)` returns no-op unless held, validates exact onsite,
  computes release amounts from frozen snapshot.
- `startNoShowWindow(booking)` uses only `onlineHeldAmount` as commission base.
- `planRefund(amount,kind,incremental)` preserves terminal no-op, security-deposit carve-out,
  refund-pending shortcut, cumulative target, and zero-service cancellation-fee branch.
- `finalizeRefund(refundId,amount,reason)` preserves refundId idempotency and cumulative arithmetic.
- `releasePlan(booking, entries)` preserves status no-op, journal-exists error,
  cancellation-fee retained fallback, refund-adjusted service/no-show split, release amounts, and
  journal inputs.
- `canOpenDispute(existing)` preserves open-existing idempotency and one-review-ever failure.
- All DB due/open-window truth remains repository CAS.

Wire start completion, start no-show, prepare/finalize refund, release, and clawback status decision.
`RecordHeldSettlementUseCase` remains a thin repository call because payment lookup/upsert and
security-deposit carve-out are transaction/adapter work. Repositories and worker are zero-diff.
Verify and commit.

## Task 4 — Payout aggregate

Create `domain/entities/payout.entity.ts`.

- `planCreation(snapshot,input,createdBy)` validates nothing-to-pay/minimum, derives cycle/window,
  and returns create data.
- `assertAllocated(amount)` enforces exact partner backing details.
- `rehydrate(record).classifyPayment()` returns already-paid/no-op, settled failure, or claim.
- `classifyFailure()` keeps paid/failed both rejected for fail endpoint.
- CAS failures map to exact in-progress/state-changed errors; repository decides whether the guarded
  update won.

Wire create/mark-paid/fail. Advisory lock + payable query order, FIFO allocation, audit writes,
ledger-before-markPaid sequence, allocation paid/release, and `payout.paid` payload remain exact.
Use `LedgerJournal` façade without altering legs. Verify and commit.

## Task 5 — SettlementDispute aggregate + outbox normalization

Create `domain/entities/settlement-dispute.entity.ts`.

- `classifyExisting(existing)` returns existing open dispute, throws for any resolved dispute, or
  allows creation.
- `rehydrate(record).isAlreadyResolved()` keeps resolve idempotency.
- `planResolution(input,settlement)` returns release or refund decision; validates refund bounds and
  the strictly-partial rule; returns exact repository data and event data.
- Partner response authorization/single-response remains repository CAS; its null result maps to
  the exact error.

Wire open/respond/resolve. Keep repository call order and produced event order:

1. release path: `settlement.release_requested` then `settlement.dispute_resolved`
2. refund path: `settlement.refund_requested` then `settlement.dispute_resolved`

In `finance.module.ts`, validate tenantId and skip-with-log for all handlers. Preserve
`affectsBookingStatus === false`, event parsing/defaults, finalize-then-clawback order, and all
handler return semantics.

Verify and commit.

## Task 6 — Docs, final module review, smoke

- Update HANDOFF status/debt/gotchas, governing spec tenantId registry, and API CLAUDE module list.
- Static review: no controller/DTO/contracts/mapper/read-side diff; all 6 repository files and
  release worker SQL zero-diff; entities framework-free; three bare Nest exceptions retained;
  outbox names/payload/order exact; all CAS false/null handling exact.
- Run API checks, full turbo suite with Node 24.18.0 and `--force`, and `check:rls`.
- Runtime smoke on isolated port where fixtures permit: commission create/update/delete guards;
  payment→held→completion/no-show/cancel/refund custody; release idempotency/ledger balance; payout
  creation/paid/fail; dispute open/respond/resolve. Record any seeded permission/fixture blocker and
  clean all created rows/settings.

Commit `docs(refactor): chốt finance final review và handoff`, merge
`refactor/entity-finance` into `refactor/entity-centric`, then continue administrative-division.
