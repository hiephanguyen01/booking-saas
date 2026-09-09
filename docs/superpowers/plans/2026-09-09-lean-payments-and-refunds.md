# Lean Payments, Refunds & Financial Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the refund mechanism by eliminating the over-engineered 4-eyes (Maker-Checker) workflow, integrate automatic Napas bank account lookup, enforce minimum deposit invariants to prevent platform commission deficit, and remove the `max0` clamp in settlement calculations to record partner receivables accurately.

**Architecture:** Hexagonal architecture in NestJS 11 with `@booking/contracts` shared schemas. Cross-module side effects through Outbox. Money in `bigint` VND. All operations wrapped in `TenantDbService.forTenant(tenantId, tx)`. One use case per file with unit test beside it.

**Tech Stack:** NestJS 11, TypeScript 5.8, Prisma ORM, PostgreSQL (RLS), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-lean-payments-refunds-and-custody-architecture-design.md`

## Global Constraints

- Backend flow: `controller → use-case → repository-port → repository`. No services in application layer (ADR 0006).
- One use case = one file with exactly one public `execute()` method.
- Every use-case must have a co-located unit test `*.use-case.spec.ts` (ADR 0009).
- Architecture guards in `tests/architecture/*.test.ts` must pass.
- Money is `bigint` VND; commission rates are integer percentages (0–100); time is `timestamptz` UTC.
- Full verification: `pnpm test && pnpm turbo lint typecheck build`.

---

### Task 1: Contract Simplification: Strip 4-Eyes Enum & Add Napas Lookup Schema

**Files:**
- Modify: `packages/contracts/src/contracts/payment.ts`
- Test: `tests/architecture/use-case-unit-tests.test.ts` (ensures contracts build cleanly)

**Interfaces:**
- Produces:
  - `manualRefundOperationStatusSchema`: `z.enum(['awaiting_details', 'ready_for_transfer', 'completed', 'failed'])`
  - `lookupBankAccountInputSchema`: `z.object({ bankBin: z.string().min(3).max(10), accountNumber: z.string().min(5).max(30) })`
  - `lookupBankAccountResponseSchema`: `z.object({ accountName: z.string(), isValid: z.boolean() })`
  - `submitManualTransferInputSchema`: `z.object({ referenceCode: z.string().min(1), proofUrl: z.string().url() })`

- [ ] **Step 1: Update payment contracts in packages/contracts/src/contracts/payment.ts**
  Simplify `manualRefundOperationStatusSchema` by removing `verification_required`, `correction_required`, `transfer_submitted`, `transfer_rejected`. Add bank account lookup and simplified transfer submission contracts.

- [ ] **Step 2: Build contracts package**
  Run: `pnpm --filter=@booking/contracts build`
  Expected: Success without TypeScript errors.

- [ ] **Step 3: Commit**
  ```bash
  git add packages/contracts/src/contracts/payment.ts
  git commit -m "feat(contracts): streamline refund statuses and add bank lookup schema"
  ```

---

### Task 2: Bank Account Lookup Use Case & Endpoint

**Files:**
- Create: `apps/api/src/modules/payments/application/use-cases/lookup-bank-account.use-case.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/lookup-bank-account.use-case.spec.ts`
- Modify: `apps/api/src/modules/payments/payments.module.ts`
- Modify: `apps/api/src/modules/payments/presentation/controllers/payments.controller.ts`

**Interfaces:**
- Consumes: `lookupBankAccountInputSchema`
- Produces: `LookupBankAccountUseCase.execute(input: LookupBankAccountInput): Promise<LookupBankAccountResponse>`

- [ ] **Step 1: Write the failing unit test**
  Create `lookup-bank-account.use-case.spec.ts` testing successful lookup returning uppercase account name and handling invalid account numbers.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm exec vitest run apps/api/src/modules/payments/application/use-cases/lookup-bank-account.use-case.spec.ts`
  Expected: FAIL (module/file not found).

- [ ] **Step 3: Implement LookupBankAccountUseCase**
  Implement `LookupBankAccountUseCase` using VietQR / Napas lookup service adapter.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm exec vitest run apps/api/src/modules/payments/application/use-cases/lookup-bank-account.use-case.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Register in PaymentsModule & Controller**
  Expose `POST /api/v1/payments/lookup-bank-account`.

- [ ] **Step 6: Commit**
  ```bash
  git add apps/api/src/modules/payments/
  git commit -m "feat(payments): add bank account lookup use case and endpoint"
  ```

---

### Task 3: Streamline Manual Refund Flow: 1-Step Confirmation with Proof

**Files:**
- Modify: `apps/api/src/modules/payments/application/use-cases/submit-manual-refund-transfer.use-case.ts` (or equivalent)
- Modify: `apps/api/src/modules/payments/application/use-cases/submit-manual-refund-transfer.use-case.spec.ts`
- Remove/Deprecate: Checker approval use cases (`approve-manual-refund-transfer.use-case.ts`, etc.)

**Interfaces:**
- Consumes: `submitManualTransferInputSchema`
- Produces: Transitions operation directly from `ready_for_transfer` to `completed` upon uploading proof and reference code.

- [ ] **Step 1: Write test verifying 1-step transition to completed**
  Verify that submitting transfer proof immediately marks the operation `completed` and the refund `succeeded`, without waiting for checker.

- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm exec vitest run apps/api/src/modules/payments/application/use-cases/submit-manual-refund-transfer.use-case.spec.ts`

- [ ] **Step 3: Update use case logic**
  Set target status to `completed`, record proof URL and reference code, and emit `refund.succeeded` via Outbox.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm exec vitest run apps/api/src/modules/payments/application/use-cases/submit-manual-refund-transfer.use-case.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/modules/payments/
  git commit -m "feat(payments): streamline manual refund to 1-step operator completion"
  ```

---

### Task 4: Enforce Deposit Floor Invariant in Catalog & Booking

**Files:**
- Modify: `apps/api/src/modules/catalog/domain/entities/listing.entity.ts` (or listing validation)
- Modify: `apps/api/src/modules/booking/application/use-cases/create-booking.use-case.ts`
- Test: Unit tests in `catalog` and `booking`

**Interfaces:**
- Consumes: Commission rates and tax rates from commission snapshot
- Produces: Throws `DepositBelowCommissionFloorError` if `deposit_percentage < (commission_rate + vat_rate + platform_fee)`

- [ ] **Step 1: Write failing test for deposit floor validation**
  Assert that creating a listing or booking with `depositPercentage = 10%` fails when `commissionRate + vatRate = 20%`.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL.

- [ ] **Step 3: Implement deposit floor validation check**
  Compare deposit against minimum financial obligation threshold.

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/modules/catalog/ apps/api/src/modules/booking/
  git commit -m "feat(booking): enforce deposit floor invariant against commission rates"
  ```

---

### Task 5: Eliminate max0 Clamping in Settlement & Record Partner Receivable

**Files:**
- Modify: `apps/api/src/modules/finance/domain/entities/settlement.entity.ts`
- Modify: `apps/api/src/modules/finance/domain/entities/settlement.entity.spec.ts` (or settlement tests)
- Modify: `apps/api/src/modules/finance/application/use-cases/release-settlement.use-case.ts`

**Interfaces:**
- Produces:
  - If `netPartnerDue < 0n`: `partnerPayable = 0n`, `partnerReceivable = -netPartnerDue`.
  - Ledger journal records Debit to `131_PARTNER_RECEIVABLE` and Credit to `511_PLATFORM_REVENUE`.

- [ ] **Step 1: Write failing unit test in settlement.entity.spec.ts**
  Test scenario where `onsiteCollectedAmount` exceeds `partnerShare`. Verify `partnerReceivable` is populated with the deficit and `partnerPayable` is 0.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm exec vitest run apps/api/src/modules/finance/`

- [ ] **Step 3: Implement partner receivable calculation in Settlement entity**
  Replace `max0(...)` clamping with explicit deficit calculation and journal leg generation.

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/modules/finance/
  git commit -m "fix(finance): replace max0 clamping with partner receivable ledger journal"
  ```

---

### Task 6: Full Verification & Architecture Guard Check

**Files:**
- Test: All suites across the repository

- [ ] **Step 1: Run architecture guards and use-case unit tests**
  Run: `pnpm test`
  Expected: All 8 architecture guards and all use-case unit tests pass.

- [ ] **Step 2: Run turbo typecheck, lint, and build**
  Run: `pnpm turbo lint typecheck build`
  Expected: 0 errors across all workspaces.

- [ ] **Step 3: Final clean commit and tag**
  ```bash
  git commit --allow-empty -m "chore(release): complete lean payments and financial integrity upgrades"
  ```
