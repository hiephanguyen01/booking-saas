# Multi-Payment Refund Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-booking/one-payment refund assumption with a durable `RefundBatch` that allocates one business refund across the exact successful source payments, including mixed-provider deposit + balance bookings and security-deposit source preservation.

**Architecture:** Keep existing `Refund` rows as provider/manual execution allocations and add one tenant-scoped `RefundBatch` as the booking-level business decision. Planning happens under the existing booking refund advisory lock, child allocations are committed before provider calls, each child executes against its own source payment/config revision, and exactly one business-level `refund.completed` event is emitted only when the batch is fully satisfied.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL 16, bigint VND, Postgres RLS/advisory locks, outbox, existing payment gateway/refund ports.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

## Global Constraints

- ADR 0005 forbids automated tests. Do not add test files/runners/scripts/CI test steps.
- ADR 0004 requires hand-written migrations. Do not run `prisma migrate dev` or `db push`.
- Every tenant-scoped table must have `tenant_id uuid NOT NULL`, FORCE RLS, and `tenant_isolation` policy.
- Money remains `bigint` VND.
- Provider network calls remain outside DB transactions.
- Existing `Refund` rows remain provider/manual execution units; legacy rows with no batch remain readable/recoverable.
- Generic cancellation/dispute allocation is newest-successful-payment first.
- `security_deposit` allocates only against the original successful `deposit`/`full` payment, never a balance payment.
- Refundable capacity is `(capturedAmount ?? legacy amount) - reserved refunds`, where reserved statuses are `pending`, `manual_required`, and `succeeded`; `failed` does not reserve capacity.
- A business refund completes only when successful child amount equals `RefundBatch.requestedAmount`.
- Child execution/manual events are operational only. They must not cause Booking/Finance to finalize the business refund early.
- For batched refunds, emit one `refund.completed` only on the batch `processing/manual_required -> completed` CAS edge.
- `affectsBookingStatus=false` remains the security-deposit behavior.

## File Map

**Schema / migration**
- Modify `apps/api/prisma/schema.prisma`.
- Create `apps/api/prisma/migrations/<timestamp>_refund_batches/migration.sql`.

**Domain / ports**
- Create `apps/api/src/modules/payments/domain/entities/refund-batch.entity.ts`.
- Create `apps/api/src/modules/payments/domain/refund-allocation.ts`.
- Create `apps/api/src/modules/payments/domain/ports/refund-batch-repository.port.ts`.
- Modify `apps/api/src/modules/payments/domain/ports/refund-repository.port.ts`.
- Modify `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts`.

**Repositories**
- Create `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund-batch.repository.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts`.

**Application / orchestration**
- Modify `apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/confirm-manual-refund.use-case.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/http/payments.module.ts`.

**Downstream compatibility**
- Modify `apps/api/src/modules/finance/infrastructure/http/finance.module.ts` so batched child `refund.requested` events do not re-prepare settlement amounts.
- No new Finance event type.
- Batched business completion emits `refund.completed` with `refundId = refundBatch.id`, `amount = requestedAmount`, `reason`, and `affectsBookingStatus`.
- Legacy non-batched refunds keep existing event semantics.

---

### Task 1: Add `RefundBatch` schema and backward-compatible child link

**Files:** schema + one hand-written migration.

**Produces:**

```prisma
enum RefundBatchStatus {
  processing
  manual_required
  completed
  failed

  @@map("refund_batch_status")
}

model RefundBatch {
  id                   String            @id @default(uuid(7)) @db.Uuid
  tenantId             String            @map("tenant_id") @db.Uuid
  bookingId            String            @map("booking_id") @db.Uuid
  requestedAmount      BigInt            @map("requested_amount")
  reason               String
  affectsBookingStatus Boolean           @default(true) @map("affects_booking_status")
  status               RefundBatchStatus @default(processing)
  completedAt          DateTime?         @map("completed_at") @db.Timestamptz(6)
  createdAt            DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  booking Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  refunds Refund[]

  @@unique([tenantId, bookingId, reason])
  @@index([tenantId, status, updatedAt])
  @@map("refund_batches")
}
```

Add to `Refund`:

```prisma
refundBatchId String?      @map("refund_batch_id") @db.Uuid
refundBatch   RefundBatch? @relation(fields: [refundBatchId], references: [id], onDelete: Cascade)
@@index([refundBatchId])
```

- [ ] Edit schema and inverse relations required by Prisma.
- [ ] Hand-write enum/table/FK/index migration; existing refunds remain `refund_batch_id NULL`.
- [ ] Add ENABLE + FORCE RLS and tenant policy to `refund_batches`.
- [ ] Verify/apply locally:

```bash
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api typecheck
```

- [ ] Commit:

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(payments): add refund batches"
```

---

### Task 2: Define deterministic allocation and batch-state policy

**Files:** create `refund-allocation.ts` and `refund-batch.entity.ts`.

**Produces:**

```ts
export interface RefundableSource {
  paymentId: string;
  availableAmount: bigint;
}

export interface RefundAllocation {
  paymentId: string;
  amount: bigint;
}

export function allocateRefundNewestFirst(
  requestedAmount: bigint,
  sourcesNewestFirst: readonly RefundableSource[],
): RefundAllocation[];
```

Implementation rule:

```ts
let remaining = requestedAmount;
const allocations: RefundAllocation[] = [];
for (const source of sourcesNewestFirst) {
  if (remaining <= 0n) break;
  if (source.availableAmount <= 0n) continue;
  const amount = source.availableAmount < remaining ? source.availableAmount : remaining;
  allocations.push({ paymentId: source.paymentId, amount });
  remaining -= amount;
}
if (remaining > 0n) throw new RefundAmountExceedsPayment();
return allocations;
```

Batch classification order:
1. `succeededAmount === requestedAmount` -> `completed`.
2. any `manual_required` child -> `manual_required`.
3. any `pending` child -> `processing`.
4. remaining shortfall with all unfinished work terminal `failed` -> `failed`.
5. `succeededAmount > requestedAmount` is an invariant breach and throws defensively.

- [ ] Implement both pure policies with no Nest/Prisma/network imports.
- [ ] Verify:

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

- [ ] Commit:

```bash
git add apps/api/src/modules/payments/domain/refund-allocation.ts \
  apps/api/src/modules/payments/domain/entities/refund-batch.entity.ts
git commit -m "feat(payments): define refund allocation policy"
```

---

### Task 3: Add batch/source repository boundaries

**Files:** payment/refund ports + new batch repository port.

**Produces:**

```ts
export const REFUND_BATCH_REPOSITORY = Symbol('REFUND_BATCH_REPOSITORY');

export interface RefundBatchRecord {
  id: string;
  tenantId: string;
  bookingId: string;
  requestedAmount: bigint;
  reason: string;
  affectsBookingStatus: boolean;
  status: 'processing' | 'manual_required' | 'completed' | 'failed';
  completedAt: Date | null;
}

export interface RefreshRefundBatchResult {
  batch: RefundBatchRecord;
  transitionedToCompleted: boolean;
}

export interface IRefundBatchRepository {
  findByBookingReason(tx: PrismaTx, bookingId: string, reason: string): Promise<RefundBatchRecord | null>;
  create(tx: PrismaTx, tenantId: string, data: {
    bookingId: string;
    requestedAmount: bigint;
    reason: string;
    affectsBookingStatus: boolean;
  }): Promise<RefundBatchRecord>;
  refreshStatus(tx: PrismaTx, batchId: string): Promise<RefreshRefundBatchResult | null>;
  findCompletedNeedingRecovery(limit: number): Promise<RefundBatchRecord[]>;
}
```

Extend child refund records/data with `refundBatchId: string | null` / optional create field and add:

```ts
reservedAmountForPayment(tx: PrismaTx, paymentId: string): Promise<bigint>;
```

Add exact payment reads:

```ts
findById(tx: PrismaTx, paymentId: string): Promise<PaymentRecord | null>;
findSucceededRefundSources(tx: PrismaTx, bookingId: string): Promise<PaymentRecord[]>;
findSecurityDepositSource(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
```

- `findSucceededRefundSources`: `status='succeeded'`, `createdAt DESC, id DESC`.
- `findSecurityDepositSource`: earliest successful `kind IN ('deposit','full')`.
- `PaymentRecord` exposes `capturedAmount` and `createdAt` after prior hardening PRs.

- [ ] Update ports.
- [ ] Do not commit until Task 4 implements adapters so branch remains compile-safe.

---

### Task 4: Implement atomic batch/repository persistence

**Files:** new Prisma batch repository + payment/refund repositories + PaymentsModule provider.

`refreshStatus()` must aggregate children and CAS status. Completion write:

```sql
UPDATE refund_batches
SET status = 'completed', completed_at = now(), updated_at = now()
WHERE id = $1 AND status <> 'completed'
```

`transitionedToCompleted=true` only when that guarded update changes one row.

`reservedAmountForPayment()` sums `pending`, `manual_required`, `succeeded`; null sum -> `0n`.

`findCompletedNeedingRecovery()` uses the admin pool for discovery and returns completed, `affects_booking_status=true` batches when either booking is not `refunded` or settlement `refund_id IS DISTINCT FROM batch.id`.

- [ ] Implement repository mappings explicitly.
- [ ] Register:

```ts
{ provide: REFUND_BATCH_REPOSITORY, useClass: PrismaRefundBatchRepository }
```

- [ ] Verify Tasks 3-4 together:

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api check:rls
```

- [ ] Commit:

```bash
git add apps/api/src/modules/payments/domain/ports \
  apps/api/src/modules/payments/infrastructure/repositories \
  apps/api/src/modules/payments/infrastructure/http/payments.module.ts
git commit -m "feat(payments): persist refund allocation batches"
```

---

### Task 5: Replace single-payment planning with batch allocation

**File:** `execute-refund.use-case.ts`.

Inside one short `forTenant` transaction:
1. take `refunds.lockForBooking(tx, bookingId)`;
2. return idempotently if batch exists for `(bookingId, reason)`;
3. source selection: security deposit -> one initial `deposit|full`; otherwise all succeeded payments newest first;
4. for each source compute `(capturedAmount ?? amount) - reservedAmountForPayment()`;
5. allocate exactly requested amount; fail before writes if aggregate capacity is insufficient;
6. create batch;
7. create one child refund per allocation with the source payment's gateway/settings strategy;
8. emit `refund.execution_requested` for automatic children and `refund.requested` for manual children;
9. commit; no provider call.

Every batched child operational event includes:

```ts
{
  refundId,
  refundBatchId,
  paymentId,
  bookingId,
  amount,
  reason,
  affectsBookingStatus,
}
```

Security-deposit rules:
- no initial succeeded source -> no batch;
- insufficient capacity on that initial source -> existing refund amount error;
- never borrow from a balance payment.

- [ ] Implement exact source allocation and per-source strategy.
- [ ] Verify:

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

- [ ] Commit:

```bash
git add apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts
git commit -m "fix(payments): allocate refunds across source payments"
```

---

### Task 6: Execute/confirm children against exact source payments and complete batch once

**Files:** automatic executor + manual confirmation use case.

Automatic path:
- load child;
- `payments.findById(tx, refund.paymentId)`; never latest booking payment;
- resolve adapter through PR1's historical `resolveForPayment(payment)` path;
- provider call outside transaction;
- apply child status;
- if batched, `refundBatches.refreshStatus(tx, refundBatchId)`;
- if `transitionedToCompleted`, emit exactly one business event:

```ts
await outbox.emit(tx, {
  tenantId,
  eventType: 'refund.completed',
  payload: {
    refundId: batch.id,
    refundBatchId: batch.id,
    bookingId: batch.bookingId,
    amount: batch.requestedAmount.toString(),
    reason: batch.reason,
    affectsBookingStatus: batch.affectsBookingStatus,
  },
});
```

Manual confirmation follows the same refresh/CAS/event rule after `markSucceeded()` and audit write.

For `refundBatchId === null`, preserve legacy child-level `refund.completed` behavior.

If automatic child falls back to manual, emit `refund.requested` with `refundBatchId` and refresh batch to `manual_required`; do not emit business completion.

- [ ] Replace any `findSucceededByBooking()` executor read with `findById(refund.paymentId)`.
- [ ] Use historical gateway config revision.
- [ ] Remove generic refund-success inference from original payment status where PR3 provides `queryRefundStatus()`.
- [ ] Refresh batch after automatic success/manual handoff/final failure and after manual confirmation.
- [ ] Verify:

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

- [ ] Commit:

```bash
git add apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/confirm-manual-refund.use-case.ts
git commit -m "fix(payments): complete refund batches atomically"
```

---

### Task 7: Prevent batched child manual events from corrupting Finance preparation

**File:** `apps/api/src/modules/finance/infrastructure/http/finance.module.ts`.

Current Finance consumes every `refund.requested` and may call `PrepareSettlementRefundUseCase` with the child amount. That is correct for legacy single refunds but wrong for batched child allocations: cancellation already prepared the full amount from `booking.cancelled`, and dispute resolution already called `settlements.prepareRefund(...)` before emitting `settlement.refund_requested`.

Change payload parsing to include `refundBatchId?: string` and skip Finance preparation for batched operational child events:

```ts
this.registry.register('refund.requested', (event) => {
  const p = event.payload as {
    refundBatchId?: string;
    bookingId: string;
    amount: string;
    reason?: string;
    affectsBookingStatus?: boolean;
  };
  if (p.refundBatchId) return Promise.resolve();
  if (p.affectsBookingStatus === false) return Promise.resolve();
  // existing legacy preparation path unchanged
});
```

Do **not** skip batched `refund.completed`; that is the single full business amount Finance must finalize.

- [ ] Add the guard exactly at the `refund.requested` handler.
- [ ] Verify API lint/typecheck/module cycles.

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm check:module-cycles
```

- [ ] Commit:

```bash
git add apps/api/src/modules/finance/infrastructure/http/finance.module.ts
git commit -m "fix(finance): ignore refund batch child requests"
```

---

### Task 8: Recover batch completion without replaying child completion

**Files:** reconciliation worker + legacy refund recovery query.

- Restrict current succeeded-refund recovery to `refund_batch_id IS NULL`.
- Inject `REFUND_BATCH_REPOSITORY` into reconciliation worker.
- For each `findCompletedNeedingRecovery(100)` result, emit the same single business `refund.completed` payload with `refundId=batch.id`, `amount=requestedAmount`.
- Never re-emit succeeded batched children; Finance would otherwise double-apply amounts.

- [ ] Implement legacy query restriction and batch recovery loop.
- [ ] Run a local sweep twice against one completed batch and confirm booking/settlement converge once.
- [ ] Commit:

```bash
git add apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts \
  apps/api/src/modules/payments/domain/ports/refund-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts
git commit -m "fix(payments): recover refund batch completion"
```

---

### Task 9: Runtime smoke financial scenarios with real DB transactions

**No committed test files.**

- [ ] Run full static gate:

```bash
pnpm check:no-tests && \
pnpm check:module-cycles && \
pnpm check:frontend-structure && \
pnpm check:theme-tokens && \
pnpm check:tenant-surfaces && \
pnpm --filter=@booking/storefront security && \
pnpm turbo lint typecheck build && \
pnpm --filter=@booking/api check:rls
```

- [ ] Start local infra, apply migration, seed, run API.
- [ ] Mixed-provider cancellation: older deposit + newer balance, refund larger than balance -> two allocations newest-first, booking not finalized after first child, batch completion finalizes once.
- [ ] Duplicate concurrent refund trigger -> one batch, no duplicate child plan.
- [ ] Mixed automatic/manual batch -> batch `manual_required` until manual confirmation; one final business completion.
- [ ] Confirm Finance `refund_pending` amount remains the full business amount while manual child operational events arrive; it must not be overwritten by a child amount.
- [ ] Security deposit -> one child on initial `deposit|full`, never balance, `affectsBookingStatus=false`.
- [ ] Existing pending/manual child reserves capacity and blocks over-refund planning.
- [ ] Reconciliation sweep twice -> no duplicate Finance refund application.

## Definition of Done

- One business refund can span multiple successful payment rows/providers.
- Allocation never exceeds captured refundable capacity.
- Security deposit preserves the original source capture.
- Automatic/manual child work is durable before provider execution.
- Exact source payment/config revision is used for every child.
- Mixed automatic/manual batches work.
- Batched child `refund.requested` does not mutate Finance business refund preparation.
- Booking/Finance receive exactly one batched business `refund.completed` only after full requested amount succeeds.
- Legacy non-batched refunds remain supported.
- Recovery cannot double-apply child amounts.
- Full static gate and focused real-DB smoke pass with zero automated test artifacts.