# Multi-Payment Refund Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-booking/one-payment refund assumption with a durable `RefundBatch` that allocates one business refund across the exact successful source payments, including mixed-provider deposit + balance bookings and security-deposit source preservation.

**Architecture:** Keep existing `Refund` rows as provider/manual execution allocations and add one tenant-scoped `RefundBatch` as the booking-level business decision. Planning happens under the existing booking refund advisory lock, child allocations are committed before any provider call, each child executes against its own source payment/config revision, and exactly one business-level `refund.completed` event is emitted only when the batch is fully satisfied.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL 16, bigint VND, Postgres RLS/advisory locks, outbox, existing payment gateway/refund ports.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

## Global Constraints

- ADR 0005 forbids automated tests. Do not add `*.test.*`, `*.spec.*`, e2e files, test runners, test scripts, or CI test steps.
- ADR 0004 requires hand-written migrations. Do not run `prisma migrate dev` or `db push`.
- Every tenant-scoped table must have `tenant_id uuid NOT NULL`, FORCE RLS, and `tenant_isolation` policy.
- Money remains `bigint` VND.
- Provider network calls remain outside DB transactions.
- Existing `Refund` rows remain the provider/manual execution unit; do not rename/rewrite the subsystem only for terminology.
- Existing legacy refund rows with no batch remain readable and recoverable.
- Generic cancellation/dispute allocation is newest-successful-payment first.
- `security_deposit` allocation must target the original successful `deposit`/`full` payment that collected the security deposit; never route it to a balance payment.
- A payment's refundable capacity is `capturedAmount (or legacy amount) - succeeded refunds - pending/manual_reserved refunds`; failed refunds do not reserve capacity.
- A business refund is complete only when successful child refund amount equals `RefundBatch.requestedAmount`.
- Do not emit business-level `refund.completed` for every child allocation. Emit it once when the batch transitions to `completed`, otherwise Booking and Finance finalize too early.
- Existing outbox event types are reused. `refund.execution_requested` remains child-execution; `refund.requested` remains manual child work; `refund.completed` becomes the single business-level batch completion event for batched refunds.
- `affectsBookingStatus=false` remains the security-deposit behavior.

## File Map

**Schema / migration**
- Modify `apps/api/prisma/schema.prisma` — add `RefundBatchStatus`, `RefundBatch`, nullable `Refund.refundBatchId`, relations/indexes.
- Create `apps/api/prisma/migrations/<timestamp>_refund_batches/migration.sql` — enum/table/FK/indexes/RLS.

**Domain / ports**
- Create `apps/api/src/modules/payments/domain/entities/refund-batch.entity.ts` — batch status classification only; no Prisma/Nest/network.
- Create `apps/api/src/modules/payments/domain/refund-allocation.ts` — deterministic pure allocation function.
- Create `apps/api/src/modules/payments/domain/ports/refund-batch-repository.port.ts` — batch persistence/CAS/recovery boundary.
- Modify `apps/api/src/modules/payments/domain/ports/refund-repository.port.ts` — batch id on child rows and reserved/succeeded totals per payment.
- Modify `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts` — exact source-payment reads for refund planning/execution.

**Repositories**
- Create `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund-batch.repository.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts`.

**Application / orchestration**
- Modify `apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts` — plan batch + child allocations under one short transaction.
- Modify `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts` — execute exact child source payment; refresh batch after child result.
- Modify `apps/api/src/modules/payments/application/use-cases/confirm-manual-refund.use-case.ts` — refresh batch after manual child confirmation.
- Modify `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts` — batch-completion recovery instead of child-based recovery for batched refunds.
- Modify `apps/api/src/modules/payments/infrastructure/http/payments.module.ts` — register new repository provider; existing event routing stays.

**Downstream compatibility**
- No new Finance event type.
- `refund.completed` payload for batched refunds uses `refundId = refundBatch.id`, `amount = requestedAmount`, `reason`, and `affectsBookingStatus`; this preserves one business-level Finance/Booking transition.
- Legacy non-batched refunds continue emitting the existing child-level `refund.completed` shape unchanged.

---

### Task 1: Add `RefundBatch` schema and backward-compatible child link

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_refund_batches/migration.sql`

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

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  booking  Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  refunds  Refund[]

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

- [ ] **Step 1: Edit Prisma schema exactly as above and add inverse relations on `Tenant` / `Booking` only if Prisma requires them.**
- [ ] **Step 2: Hand-write migration SQL.** Create enum, table, unique/indexes, FK from `refunds.refund_batch_id`, and tenant/booking FKs. Existing refunds remain `NULL`.
- [ ] **Step 3: Add RLS to the new table.** Follow the repository's existing tenant-table migration pattern: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `tenant_isolation` policy using `current_setting('app.tenant_id', true)::uuid`.
- [ ] **Step 4: Verify migration shape.**

```bash
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 5: Apply to local dev DB and inspect constraints.**

```bash
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
```

Confirm with `psql` that `refund_batches` has FORCE RLS and `refunds.refund_batch_id` is nullable.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(payments): add refund batches"
```

---

### Task 2: Define deterministic allocation and batch status policy

**Files:**
- Create: `apps/api/src/modules/payments/domain/refund-allocation.ts`
- Create: `apps/api/src/modules/payments/domain/entities/refund-batch.entity.ts`

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

Allocation behavior:

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

Use the existing refund amount domain error for insufficient aggregate refundable balance; do not create a generic `Error` for this business failure.

`RefundBatch` entity consumes aggregate child counts/amounts and returns one status:

```ts
export type RefundBatchClassification =
  | 'processing'
  | 'manual_required'
  | 'completed'
  | 'failed';
```

Rules in order:
1. `succeededAmount === requestedAmount` -> `completed`.
2. any child `manual_required` -> `manual_required`.
3. any child `pending` -> `processing`.
4. otherwise, if successful amount is still short and all remaining children are terminal `failed` -> `failed`.
5. never classify `completed` if successful amount exceeds requested amount; throw defensively because that is a persistence invariant breach.

- [ ] **Step 1: Implement the pure allocation function.** It must preserve input order and never allocate zero/negative amounts.
- [ ] **Step 2: Implement `RefundBatch.rehydrate({ requestedAmount })` and `classify(summary)` with the exact rules above.**
- [ ] **Step 3: Run targeted static checks.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/modules/payments/domain/refund-allocation.ts \
  apps/api/src/modules/payments/domain/entities/refund-batch.entity.ts
git commit -m "feat(payments): define refund allocation policy"
```

---

### Task 3: Add batch/source repository boundaries

**Files:**
- Create: `apps/api/src/modules/payments/domain/ports/refund-batch-repository.port.ts`
- Modify: `apps/api/src/modules/payments/domain/ports/refund-repository.port.ts`
- Modify: `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts`

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

export interface RefundBatchChildSummary {
  succeededAmount: bigint;
  pendingCount: number;
  manualRequiredCount: number;
  failedCount: number;
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

Add to child refund contracts:

```ts
refundBatchId: string | null;
```

and to `CreateRefundData`:

```ts
refundBatchId?: string | null;
```

Add refund reservation query:

```ts
reservedAmountForPayment(tx: PrismaTx, paymentId: string): Promise<bigint>;
```

It sums child amounts in statuses `pending`, `manual_required`, and `succeeded`; `failed` is excluded.

Add exact payment reads:

```ts
findById(tx: PrismaTx, paymentId: string): Promise<PaymentRecord | null>;
findSucceededRefundSources(tx: PrismaTx, bookingId: string): Promise<PaymentRecord[]>;
findSecurityDepositSource(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
```

`findSucceededRefundSources` orders `createdAt DESC, id DESC` and returns only `status='succeeded'`.

`findSecurityDepositSource` selects the earliest successful `kind IN ('deposit','full')`; balance payments are never eligible because the checkout plan collects security deposit only on the initial payment.

- [ ] **Step 1: Add the batch repository port.** No Prisma model imports beyond enum-compatible string types; keep the port framework-free except `PrismaTx` as established repository convention.
- [ ] **Step 2: Extend refund and payment repository ports with the exact methods above.**
- [ ] **Step 3: Update `PaymentRecord` to expose `capturedAmount` from PR1/PR2 and `createdAt` if it is not already present after those PRs.** Refund capacity uses `capturedAmount ?? amount` for legacy successful payments.
- [ ] **Step 4: Verify.**

```bash
pnpm --filter=@booking/api typecheck
```

Expected at this step: repository adapters/use-cases fail typecheck until Task 4 implements the new methods. Do not commit a deliberately uncompilable intermediate branch; complete Task 4 before the next commit.

---

### Task 4: Implement atomic batch/repository persistence

**Files:**
- Create: `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund-batch.repository.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/payments.module.ts`

**Key persistence rules:**

`PrismaRefundBatchRepository.refreshStatus()` must compute child aggregate state in the same RLS transaction, classify it with `RefundBatch`, then use guarded writes. Completion uses:

```sql
UPDATE refund_batches
SET status = 'completed', completed_at = now(), updated_at = now()
WHERE id = $1
  AND status <> 'completed'
```

`transitionedToCompleted` is true only when that guarded update changes one row. Duplicate child completions therefore cannot emit two business completion events.

`findCompletedNeedingRecovery()` uses the admin pool only for cross-tenant discovery and returns completed batches whose downstream booking/settlement projection has not converged. Treat either condition as needing recovery when `affects_booking_status=true`:

- booking is not `refunded`; or
- booking settlement `refund_id IS DISTINCT FROM refund_batches.id`.

For `affects_booking_status=false`, do not require booking/settlement finalization recovery.

- [ ] **Step 1: Implement `PrismaRefundBatchRepository`.** Map rows explicitly and classify status through the domain entity.
- [ ] **Step 2: Implement `reservedAmountForPayment()`.** Use `SUM(amount)` over `pending`, `manual_required`, `succeeded`; return `0n` on null.
- [ ] **Step 3: Persist `refundBatchId` on child create/read mappings.** Legacy rows remain null.
- [ ] **Step 4: Implement exact payment-source queries.** Include `capturedAmount`, config revision fields required by PR1, and stable ordering.
- [ ] **Step 5: Register repository provider in `PaymentsModule`.**

```ts
{ provide: REFUND_BATCH_REPOSITORY, useClass: PrismaRefundBatchRepository }
```

- [ ] **Step 6: Verify and commit Tasks 3-4 together.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api check:rls

git add apps/api/src/modules/payments/domain/ports \
  apps/api/src/modules/payments/infrastructure/repositories \
  apps/api/src/modules/payments/infrastructure/http/payments.module.ts
git commit -m "feat(payments): persist refund allocation batches"
```

---

### Task 5: Replace single-payment refund planning with batch allocation

**Files:**
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts`

**Consumes:**
- `allocateRefundNewestFirst()`
- `IRefundBatchRepository`
- `IPaymentRepository.findSucceededRefundSources()`
- `IPaymentRepository.findSecurityDepositSource()`
- `IRefundRepository.reservedAmountForPayment()`

**Behavior:**

Inside one short `forTenant` transaction:
1. take existing `refunds.lockForBooking(tx, bookingId)` advisory lock;
2. if batch exists for `(bookingId, reason)`, return idempotently;
3. choose sources:
   - `security_deposit` -> exactly one `findSecurityDepositSource()` result;
   - all other reasons -> `findSucceededRefundSources()` newest first;
4. for each source compute `available = (capturedAmount ?? amount) - reservedAmountForPayment()`;
5. allocate exactly `requestedAmount` using the domain function;
6. create `RefundBatch(status=processing)`;
7. create one child `Refund` per allocation using the source payment's gateway/payment method and current refund strategy logic;
8. emit one `refund.execution_requested` for every automatic child; emit one `refund.requested` for every manual child;
9. commit; no provider call occurs here.

Security-deposit source validation:
- if no initial successful `deposit|full` payment exists, return without creating a batch because there is no captured source to refund;
- if the source's available refundable capacity is below requested security deposit, throw the existing refund-amount domain error instead of borrowing from a balance payment.

For normal cancellation/dispute refunds, if aggregate available refundable amount is below the requested amount, throw before creating the batch/children so no partial business plan is persisted.

- [ ] **Step 1: Inject `REFUND_BATCH_REPOSITORY` and remove `findSucceededByBooking()` planning.**
- [ ] **Step 2: Implement source capacity calculation exactly as above.**
- [ ] **Step 3: Create batch before children and assign `refundBatchId` to every new child.**
- [ ] **Step 4: Preserve existing refund strategy/manual SLA resolution per source payment.** With mixed providers, each child may independently be automatic or manual.
- [ ] **Step 5: Emit child execution/manual events with `refundId`, `refundBatchId`, `paymentId`, `bookingId`, `amount`, `reason`, `affectsBookingStatus`.** These events are operational allocation events, not business completion.
- [ ] **Step 6: Verify.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts
git commit -m "fix(payments): allocate refunds across source payments"
```

---

### Task 6: Execute each child against its exact source payment and complete the batch once

**Files:**
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/confirm-manual-refund.use-case.ts`

**Automatic execution:**
- load child refund by id;
- load `payment = payments.findById(tx, refund.paymentId)`; never use latest booking payment;
- resolve gateway through PR1's `resolveForPayment(payment)` historical-config path;
- provider call remains outside transaction;
- apply provider result to the child;
- call `refundBatches.refreshStatus(tx, refund.refundBatchId)` for batched rows;
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

For legacy child `refundBatchId === null`, preserve the old behavior and emit the existing child-level `refund.completed` event.

If automatic execution becomes `manual_required`, refresh the batch after the child transition. A batch with any manual child becomes `manual_required`; do not emit business completion.

**Manual confirmation:** after `markSucceeded()` and audit write, refresh the batch. Emit business completion only on the `transitionedToCompleted` CAS edge. Legacy child behavior stays unchanged.

- [ ] **Step 1: Replace automatic executor's `findSucceededByBooking()` with exact `findById(refund.paymentId)`.**
- [ ] **Step 2: Resolve historical gateway config from the source payment.**
- [ ] **Step 3: Remove the old generic fallback that infers refund success from original payment status for providers that now implement `queryRefundStatus()` in PR3.** Keep provider-specific legacy void behavior only where the adapter contract explicitly returns it.
- [ ] **Step 4: Refresh batch after automatic success/manual handoff/final failure.**
- [ ] **Step 5: Refresh batch after manual confirmation and gate event emission on the completion CAS.**
- [ ] **Step 6: Verify.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/confirm-manual-refund.use-case.ts
git commit -m "fix(payments): complete refund batches atomically"
```

---

### Task 7: Recover batch completion without replaying child completion

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts`
- Modify: `apps/api/src/modules/payments/domain/ports/refund-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts`

**Behavior:**
- Keep legacy `findSucceededNeedingRecovery()` for rows with `refund_batch_id IS NULL` only.
- Add `REFUND_BATCH_REPOSITORY` to reconciliation worker.
- Query `findCompletedNeedingRecovery(100)`.
- For each completed batch, emit the same single business `refund.completed` payload using `refundId=batch.id` and `amount=requestedAmount`.
- Downstream Booking/Finance handlers remain idempotent; settlement `refund_id=batch.id` is the convergence marker for batched service refunds.
- Do not re-emit every succeeded child; that would double-apply Finance amounts.

- [ ] **Step 1: Restrict legacy refund recovery query to `refund_batch_id IS NULL`.**
- [ ] **Step 2: Add completed-batch recovery loop.**
- [ ] **Step 3: Verify duplicate recovery.** Run the worker/sweep twice against a local completed batch and confirm the downstream settlement/refunded booking does not change twice.
- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts \
  apps/api/src/modules/payments/domain/ports/refund-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts
git commit -m "fix(payments): recover refund batch completion"
```

---

### Task 8: Runtime smoke the financial scenarios with real DB transactions

**Files:** no committed test files.

- [ ] **Step 1: Run full static gate.**

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

- [ ] **Step 2: Start local infra/app and seed.**

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api seed
pnpm --filter=@booking/api dev
```

- [ ] **Step 3: Smoke mixed-provider multi-payment cancellation.** Create/prepare a booking with two succeeded source payments: older deposit and newer balance. Use mock/provider-safe local data so deposit and balance can carry different gateway keys/config revisions. Request a cancellation refund larger than the balance alone. Confirm:
  - one `refund_batches` row;
  - two child `refunds` rows when required by capacity;
  - newest payment allocated first;
  - total child amount equals requested amount;
  - provider calls occur per child source payment;
  - booking remains not-refunded after first child succeeds;
  - only after all children succeed does batch become completed and booking/settlement finalize once.

- [ ] **Step 4: Smoke concurrent duplicate refund planning.** Deliver the same cancellation/recovery trigger concurrently. Confirm the advisory lock + unique batch key produce one batch and no duplicate allocations.

- [ ] **Step 5: Smoke manual + automatic mixed batch.** Make one child automatic and one manual. Confirm batch becomes `manual_required`, automatic child success does not finalize booking, manual confirmation transitions the batch to `completed`, and exactly one business `refund.completed` is observable.

- [ ] **Step 6: Smoke security-deposit source preservation.** Create a booking with initial `deposit|full` capture plus later balance. Trigger `security_deposit` return. Confirm the child points only to the initial payment, never the balance, and `affectsBookingStatus=false` leaves booking/settlement service-refund status unchanged.

- [ ] **Step 7: Smoke capacity accounting.** With one pending/manual child already reserving part of a payment, request a second legal refund path and confirm reserved amount is excluded from availability so no over-refund plan can be created.

- [ ] **Step 8: Commit any documentation-only smoke notes if the repository convention requires them; do not commit disposable scripts or test files.**

## Definition of Done

- One business refund can span multiple successful payment rows/providers.
- Refund allocation never exceeds captured refundable capacity.
- Pending/manual/succeeded child rows reserve capacity; failed rows do not.
- Security deposit targets the original initial capture only.
- Automatic/manual child work is durable before provider execution.
- Exact source payment/config revision is used for every child execution.
- A mixed batch may be partly automatic and partly manual.
- Booking/Finance receive exactly one business `refund.completed` only when the requested batch amount is fully succeeded.
- Legacy non-batched refunds remain supported.
- Batch recovery cannot double-apply child refund amounts.
- Full repository static gate and focused real-DB runtime smoke pass with no automated test artifacts added.