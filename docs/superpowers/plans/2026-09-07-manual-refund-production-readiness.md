# Manual Refund V2 Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible rollout controls, secret-safe readiness checks, and actionable Manual Refund V2 operational health signals before any production tenant can opt in.

**Architecture:** Keep `tenant.settings.manual_refund_v2=true` as the durable opt-in and add `manual_refund_v2_paused=true` as a reversible emergency stop that preserves every operation, receipt, audit row, and refund state. Platform-only preflight reads capabilities—not secret values—and the existing platform health read model gains PII-free Manual Refund V2 signals. No task in this plan enables a production tenant or gateway.

**Tech Stack:** TypeScript 5.9, NestJS 11, Prisma/PostgreSQL RLS, React Router 8 SSR dashboard, Zod contracts, Vitest use-case tests and architecture guards.

**Spec:** `docs/superpowers/plans/2026-09-04-manual-refund-v2.md` (Global Constraints and Task 7 rollout requirements)

## Global Constraints

- Do not deploy to production or enable `manual_refund_v2` for a production tenant in this plan.
- Preserve current `RefundStatus`, `RefundBatchStatus`, `ManualRefundOperationStatus`, automatic refunds, and the completed staging canary evidence.
- Pausing is reversible and must never delete operations, destinations, evidence, audit rows, refunds, batches, bookings, settlements, or outbox events.
- A paused tenant may read queue/detail/status data, but every Manual Refund V2 mutation—including reveal and break-glass—returns `409 MANUAL_REFUND_WORKFLOW_PAUSED`.
- The legacy child-level manual-confirm endpoint remains blocked for an opted-in tenant even while paused; pause must never create a bypass.
- Readiness responses contain check names, boolean status, and safe reasons only. They must never contain secret values, ciphertext, fingerprints, account names/numbers, receipt keys, or presigned URLs.
- Operational health uses aggregate counts and ages only. It must not expose booking codes, customer identity, bank data, transfer references, object keys, or actor IPs.
- Follow `AGENTS.md`: one use case per file, one adjacent use-case spec, architecture tests only, handwritten migrations only, and `controller → use-case → repository-port → repository`.
- Use database time for persisted decisions and tenant RLS for tenant mutations. Cross-tenant health aggregation stays in the admin-pool read adapter.

---

### Task 1: Reversible pause/resume control

**Files:**
- Modify: `packages/contracts/src/contracts/tenancy.ts`
- Modify: `packages/contracts/src/contracts/payment.ts`
- Modify: `apps/api/src/modules/payments/domain/errors/manual-refund-errors.ts`
- Modify: `apps/api/src/modules/payments/domain/ports/manual-refund-operation-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-manual-refund-operation.repository.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/pause-manual-refund-workflow.use-case.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/pause-manual-refund-workflow.use-case.spec.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/resume-manual-refund-workflow.use-case.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/resume-manual-refund-workflow.use-case.spec.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/platform-manual-refund.controller.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/dto/payments.dto.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/payments.module.ts`

**Interfaces:**
- Consumes: existing tenant JSON settings, `TenantDbService`, `IAuditWriter`, and `platform.tenants.write`.
- Produces: `ManualRefundWorkflowState`, repository pause/resume operations, and two platform endpoints.

- [ ] **Step 1: Add failing pause/resume use-case specs**

```ts
it('pauses an enabled workflow without deleting or completing operations', async () => {
  const result = await useCase.execute(TENANT_ID, {
    reason: 'Suspected finance-account compromise',
  }, PLATFORM_ADMIN_ID);

  expect(result).toEqual({ enabled: true, paused: true });
  expect(settingsWrites).toEqual([
    { manual_refund_v2: true, manual_refund_v2_paused: true },
  ]);
  expect(audits[0]).toMatchObject({
    action: 'manual_refund.workflow_paused',
    data: { reason: 'Suspected finance-account compromise', severity: 'high' },
  });
});
```

Add resume coverage proving it only clears `manual_refund_v2_paused`, leaves `manual_refund_v2=true`, requires a non-empty reason, and is idempotent.

- [ ] **Step 2: Run the new specs and verify red**

Run:

```bash
pnpm --filter=@booking/api test -- pause-manual-refund-workflow.use-case.spec.ts resume-manual-refund-workflow.use-case.spec.ts
```

Expected: FAIL because the use cases and repository methods do not exist.

- [ ] **Step 3: Add contracts and named domain error**

```ts
export const manualRefundWorkflowStateSchema = z.object({
  enabled: z.boolean(),
  paused: z.boolean(),
});

export const manualRefundWorkflowControlInputSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

export class ManualRefundWorkflowPaused extends DomainError {
  constructor() {
    super('MANUAL_REFUND_WORKFLOW_PAUSED', 409, 'Manual refund workflow is paused');
  }
}
```

- [ ] **Step 4: Extend the repository port and Prisma adapter**

Add these exact methods:

```ts
getWorkflowState(tx: PrismaTx, tenantId: string): Promise<{ enabled: boolean; paused: boolean }>;
setWorkflowPaused(tx: PrismaTx, tenantId: string, paused: boolean): Promise<void>;
```

The adapter must merge tenant settings rather than replace them:

```ts
const settings = tenant.settings as Record<string, unknown>;
await tx.tenant.update({
  where: { id: tenantId },
  data: {
    settings: {
      ...settings,
      manual_refund_v2: true,
      manual_refund_v2_paused: paused,
    },
  },
});
```

- [ ] **Step 5: Implement pause and resume atomically**

Each use case must enter `forTenant`, read the current state, update settings, and write the audit in the same transaction. Pause/resume must not query or modify refund operations.

- [ ] **Step 6: Add platform routes**

```text
POST /platform/tenants/:tenantId/refunds/pause-workflow
POST /platform/tenants/:tenantId/refunds/resume-workflow
Permission: platform.tenants.write
Body: { reason: string }
```

- [ ] **Step 7: Run the focused specs and commit**

```bash
pnpm --filter=@booking/api test -- pause-manual-refund-workflow.use-case.spec.ts resume-manual-refund-workflow.use-case.spec.ts
git add packages/contracts apps/api/src/modules/payments
git commit -m "feat(payments): add reversible manual refund rollout control"
```

---

### Task 2: Enforce the pause across every mutation

**Files:**
- Modify: `apps/api/testing/manual-refund-fixtures.ts`
- Modify these use cases and their adjacent specs:
  - `submit-customer-manual-refund-destination.use-case.ts`
  - `acknowledge-customer-manual-refund-received.use-case.ts`
  - `report-customer-manual-refund-not-received.use-case.ts`
  - `verify-manual-refund-destination.use-case.ts`
  - `claim-manual-refund.use-case.ts`
  - `reassign-manual-refund.use-case.ts`
  - `create-manual-refund-evidence-upload.use-case.ts`
  - `submit-manual-refund-transfer.use-case.ts`
  - `approve-manual-refund.use-case.ts`
  - `reject-manual-refund.use-case.ts`
  - `reopen-manual-refund-destination.use-case.ts`
  - `reveal-manual-refund-private-details.use-case.ts`
  - `break-glass-complete-manual-refund.use-case.ts`
  - `confirm-manual-refund.use-case.ts`
- Create: `tests/architecture/manual-refund-pause-coverage.test.ts`

**Interfaces:**
- Consumes: `IManualRefundOperationRepository.getWorkflowState()` and `ManualRefundWorkflowPaused`.
- Produces: a uniform 409 gate with no legacy bypass.

- [ ] **Step 1: Add paused-state cases to every affected use-case spec**

Use the same expectation in each spec:

```ts
operations.getWorkflowState = async () => ({ enabled: true, paused: true });

await expect(useCase.execute(/* existing valid arguments */)).rejects.toMatchObject({
  code: 'MANUAL_REFUND_WORKFLOW_PAUSED',
  status: 409,
});

expect(operationWrites).toHaveLength(0);
expect(audits).toHaveLength(0);
expect(outboxEvents).toHaveLength(0);
```

For `confirm-manual-refund`, assert `MANUAL_REFUND_BATCH_WORKFLOW_REQUIRED` still wins for an enabled tenant so pause cannot re-enable the legacy child endpoint.

- [ ] **Step 2: Run the affected specs and verify red**

```bash
pnpm --filter=@booking/api test -- manual-refund
```

Expected: paused-state cases fail because writes are currently allowed.

- [ ] **Step 3: Add the gate at the start of each transaction**

```ts
const workflow = await this.operations.getWorkflowState(tx, tenantId);
if (workflow.paused) throw new ManualRefundWorkflowPaused();
```

The check must execute before reading/decrypting destination data, inspecting evidence, mutating uploads, recording acknowledgement, or validating break-glass freshness.

- [ ] **Step 4: Add an architecture coverage guard**

`tests/architecture/manual-refund-pause-coverage.test.ts` must hold the explicit list of mutation use-case files and assert that each references `getWorkflowState` and `ManualRefundWorkflowPaused`. This prevents future mutation endpoints from silently bypassing pause.

- [ ] **Step 5: Run focused and architecture tests, then commit**

```bash
pnpm --filter=@booking/api test -- manual-refund
pnpm vitest run tests/architecture/manual-refund-pause-coverage.test.ts
git add apps/api tests/architecture
git commit -m "fix(payments): stop manual refund mutations while paused"
```

---

### Task 3: Secret-safe production preflight

**Files:**
- Modify: `packages/contracts/src/contracts/payment.ts`
- Create: `apps/api/src/modules/payments/domain/ports/manual-refund-readiness.port.ts`
- Create: `apps/api/src/modules/payments/infrastructure/manual-refund-readiness.adapter.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/get-manual-refund-readiness.use-case.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/get-manual-refund-readiness.use-case.spec.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/platform-manual-refund.controller.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/payments.module.ts`
- Modify: `apps/dashboard/app/constants/api-paths.ts`
- Modify: `apps/dashboard/app/features/admin/components/tenant-manual-refund-workflow-card.tsx`
- Modify: `apps/dashboard/app/features/admin/server/tenant-detail-actions.server.ts`
- Modify: `apps/dashboard/app/routes/admin/tenants/detail.tsx`
- Modify: `tests/architecture/request-logging-security.test.ts`

**Interfaces:**
- Consumes: process configuration, Prisma admin read checks, storage configuration, and tenant workflow state.
- Produces: `GET /platform/tenants/:tenantId/refunds/readiness` and a dashboard gate for enable/resume.

- [ ] **Step 1: Write the failing readiness use-case spec**

```ts
expect(await useCase.execute(TENANT_ID)).toEqual({
  ready: false,
  workflow: { enabled: false, paused: false },
  checks: [
    { key: 'pii_keyring', ok: true },
    { key: 'pii_active_key', ok: true },
    { key: 'pii_fingerprint_key', ok: true },
    { key: 'private_storage', ok: true },
    { key: 'schema', ok: true },
    { key: 'system_role_permissions', ok: false, reason: 'missing_permissions' },
    { key: 'worker_enabled', ok: true },
  ],
});
```

Add a recursive assertion that serialized output contains none of: the configured key material, `destinationAccount`, `fingerprint`, `objectKey`, `presigned`, or `secret`.

- [ ] **Step 2: Run the spec and verify red**

```bash
pnpm --filter=@booking/api test -- get-manual-refund-readiness.use-case.spec.ts
```

- [ ] **Step 3: Define the readiness port**

```ts
export type ManualRefundReadinessCheckKey =
  | 'pii_keyring'
  | 'pii_active_key'
  | 'pii_fingerprint_key'
  | 'private_storage'
  | 'schema'
  | 'system_role_permissions'
  | 'worker_enabled';

export interface ManualRefundReadinessPort {
  inspect(tenantId: string): Promise<Array<{
    key: ManualRefundReadinessCheckKey;
    ok: boolean;
    reason?: string;
  }>>;
}
```

- [ ] **Step 4: Implement safe capability checks**

The adapter must:

- parse the PII keyring using the same validation rules as `AesGcmManualRefundPiiCryptoAdapter`;
- report only whether the active version exists and all decoded keys are 32 bytes;
- verify the fingerprint key is 32 bytes and not byte-equal to any encryption key without returning either value;
- verify required tables/indexes and the four permissions with read-only admin queries;
- verify private storage is configured through a non-mutating adapter capability check;
- report `worker_enabled=false` when `OUTBOX_RELAY_DISABLED=true`;
- never log caught exception messages; map them to fixed reason codes.

- [ ] **Step 5: Expose and render preflight**

Add:

```text
GET /platform/tenants/:tenantId/refunds/readiness
Permission: platform.tenants.write
Cache-Control: no-store
```

The dashboard card must disable **Bật** and **Tiếp tục** while any required check fails and display only the safe check label/reason.

- [ ] **Step 6: Extend the logging architecture guard**

Assert the readiness adapter never interpolates environment values or raw exception messages into `Logger` calls, and the response schema has no arbitrary record/string payload field.

- [ ] **Step 7: Run focused verification and commit**

```bash
pnpm --filter=@booking/api test -- get-manual-refund-readiness.use-case.spec.ts
pnpm vitest run tests/architecture/request-logging-security.test.ts
pnpm turbo typecheck --filter=@booking/api... --filter=@booking/dashboard...
git add packages/contracts apps/api apps/dashboard tests/architecture
git commit -m "feat(payments): add secret-safe manual refund preflight"
```

---

### Task 4: Add Manual Refund V2 health signals and safe worker failures

**Files:**
- Modify: `apps/api/src/modules/tenancy/domain/ports/platform-health-reader.port.ts`
- Modify: `apps/api/src/modules/tenancy/infrastructure/repositories/prisma-platform-health.reader.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/get-platform-health.use-case.ts`
- Modify: `apps/api/src/modules/tenancy/application/use-cases/get-platform-health.use-case.spec.ts`
- Modify: `packages/contracts/src/contracts/platform.ts`
- Modify: `apps/dashboard/app/features/admin/components/platform-kpi-cards.tsx`
- Modify: `apps/dashboard/app/features/admin/components/tenant-health-table.tsx`
- Create: `apps/dashboard/app/features/admin/components/manual-refund-health-card.tsx`
- Modify: `apps/dashboard/app/routes/admin/_index.tsx`
- Modify: `apps/api/src/modules/payments/infrastructure/manual-refund-sla.worker.ts`
- Create: `tests/architecture/manual-refund-observability.test.ts`

**Interfaces:**
- Consumes: `manual_refund_operations`, tenant settings, and audit records through admin-pool read queries.
- Produces: aggregate platform/tenant health fields and fixed, PII-free worker error events.

- [ ] **Step 1: Add failing health use-case assertions**

Extend the fake facts and assert these exact aggregate fields:

```ts
manualRefunds: {
  enabledTenants: 3,
  pausedTenants: 1,
  openOperations: 7,
  overdueOperations: 2,
  awaitingApproval: 1,
  oldestOpenMinutes: 190,
  customerNotReceived: 1,
  reveals24h: 4,
  breakGlass30d: 0,
}
```

Per tenant add `manualRefundOpen`, `manualRefundOverdue`, and `manualRefundOldestMinutes`.

- [ ] **Step 2: Run the health spec and verify red**

```bash
pnpm --filter=@booking/api test -- get-platform-health.use-case.spec.ts
```

- [ ] **Step 3: Extend the admin-pool read adapter**

Use aggregate SQL only. The query must count non-completed operations, `transfer_due_at < now()`, `status='transfer_submitted'`, `customer_acknowledgement='not_received'`, and audit actions for reveal/break-glass windows. Return ages as integer minutes; never select identity, destination, reference, receipt, reason, or IP columns.

- [ ] **Step 4: Compute operational severity in the use case**

```ts
const severity =
  facts.breakGlass30d > 0 || facts.customerNotReceived > 0 || facts.overdueOperations > 0
    ? 'critical'
    : facts.oldestOpenMinutes >= 60
      ? 'warning'
      : 'healthy';
```

Expose this in the shared Zod contract. Counts remain numbers; no money or PII enters this projection.

- [ ] **Step 5: Render platform signals**

Add a Manual Refund V2 health card showing enabled/paused tenants, open/overdue queue, oldest age, waiting checker, not-received, reveal count, and break-glass count. Add open/overdue counts to the tenant table and include them in the existing “Cảnh báo vận hành” total.

- [ ] **Step 6: Replace unsafe worker debug messages**

Replace string interpolation of `error.message` with fixed warnings:

```ts
this.logger.warn({
  event: 'manual_refund_worker_item_failed',
  phase: 'ciphertext_purge',
  tenantId: candidate.tenantId,
  operationId: candidate.operationId,
  errorType: error instanceof Error ? error.name : 'UnknownError',
});
```

Do not include the error message or stack because downstream adapters may contain PII-bearing validation text.

- [ ] **Step 7: Add the observability architecture guard**

The guard must reject account/reference/object-key columns in the platform health SQL and reject `error.message`/`String(error)` in `manual-refund-sla.worker.ts`.

- [ ] **Step 8: Run tests/build and commit**

```bash
pnpm --filter=@booking/api test -- get-platform-health.use-case.spec.ts
pnpm vitest run tests/architecture/manual-refund-observability.test.ts
pnpm turbo lint typecheck build --filter=@booking/api... --filter=@booking/dashboard...
git add apps/api apps/dashboard packages/contracts tests/architecture
git commit -m "feat(ops): surface manual refund production health"
```

---

### Task 5: Production gate runbook and staging rehearsal

**Files:**
- Create: `docs/runbooks/manual-refund-v2-production-gate.md`
- Modify: `docs/deployment.md`
- Modify: `docs/deployment-runbook.md`
- Modify: `docs/runbooks/finance-reconciliation.md`
- Modify: `.env.deploy.example`
- Create: `tests/architecture/manual-refund-production-readiness.test.ts`

**Interfaces:**
- Consumes: pause/resume, readiness response, platform health signals, immutable deploy SHA, and existing reconciliation queries.
- Produces: a repeatable go/no-go gate; it does not perform a production deploy.

- [ ] **Step 1: Write the architecture test first**

The test must require the runbook to contain these literal stop conditions:

```text
readiness.ready=false
manualRefunds.severity=critical
duplicate debit
amount mismatch
unverified webhook
customer_not_received
break-glass
pause-workflow
rollback SHA
```

It must also assert `.env.deploy.example` documents safe thresholds but contains no real domain credential, account number, transfer reference, or secret value.

- [ ] **Step 2: Run the guard and verify red**

```bash
pnpm vitest run tests/architecture/manual-refund-production-readiness.test.ts
```

- [ ] **Step 3: Author the production gate runbook**

The runbook must require, in order:

1. exact release SHA with CI green and a recorded rollback SHA;
2. database backup and confirmed migrations;
3. `readiness.ready=true` for the candidate tenant;
4. workflow initially paused and payment routes disabled;
5. two distinct finance users with prepare/approve permissions and no shared session;
6. private storage upload/download/quarantine probe with disposable evidence;
7. alert-board baseline captured with no critical signal;
8. workflow resume only after gateway route limits are set;
9. one production canary transaction with an explicit monetary cap approved separately;
10. pause, disable gateway route, reconcile and rollback on any stop condition;
11. retain redacted evidence and never copy PII/secrets into GitHub, chat, analytics, or incident documents.

- [ ] **Step 4: Define alert thresholds in deployment documentation**

Document the initial production-canary thresholds:

```dotenv
MANUAL_REFUND_ALERT_OLDEST_OPEN_MINUTES=60
MANUAL_REFUND_ALERT_OVERDUE_COUNT=1
MANUAL_REFUND_ALERT_NOT_RECEIVED_COUNT=1
MANUAL_REFUND_ALERT_BREAK_GLASS_COUNT=1
```

These values drive the operator gate/documented monitoring policy; do not invent an external paging provider in this plan. Production remains blocked until the chosen log/monitoring platform turns the `critical` health state and fixed worker warning event into an owned notification channel.

- [ ] **Step 5: Rehearse on staging with no real debit**

Use a disposable Manual Refund V2 fixture and prove:

- pause returns 409 for customer submit, maker transfer, checker approval, reveal, and break-glass;
- reads remain available and all operation/batch/refund/booking/settlement rows are unchanged;
- resume restores the workflow;
- readiness reports pass/fail without exposing secret values;
- health counts and severity change when an overdue fixture is introduced and return to baseline after cleanup;
- the canary SePay route and gateway remain disabled throughout this rehearsal.

- [ ] **Step 6: Run the complete verification suite**

```bash
pnpm test
pnpm turbo lint typecheck build
git diff --check
```

Expected: all commands exit 0. Also run the applications against disposable Postgres/Redis/private storage and save only redacted probe output.

- [ ] **Step 7: Commit documentation and guards**

```bash
git add docs .env.deploy.example tests/architecture
git commit -m "docs(ops): define manual refund production gate"
```

## Final Go/No-Go Rule

Completing this implementation plan permits only a separately approved, capped production canary. Production remains **NO-GO** when any readiness check fails, any Manual Refund V2 health signal is critical, external ownership of the alert channel is missing, maker/checker independence is unavailable, gateway/IPN configuration is unverified, rollback SHA is absent, or the monetary cap has not been explicitly approved.
