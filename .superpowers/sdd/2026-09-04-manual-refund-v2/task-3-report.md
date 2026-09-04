# Task 3 report — tenant maker-checker API, private evidence, and legacy gate

Status: **COMPLETE (code-only; no shared-environment execution)**

## Delivered in this worktree

- Added tenant-scoped list/detail views with explicit masked mappers that omit persistence secrets and object keys.
- Added CAS-backed destination verification, claim, reassignment, rejection, and reopen use cases with audit records and DB-clock metadata.
- Added private receipt upload grants and evidence records with tenant/operation key scoping, write-once grants, size/MIME restrictions, checksum/signature inspection, quarantine, and claim CAS.
- Added transfer submission with receipt checksum verification, normalized reference persistence, duplicate mapping support, and audit.
- Added Prisma operation list/detail/view queries, evidence persistence, and atomic manual-child completion repository method.
- Added tenant controller routes and module wiring for the delivered non-disclosure flows.
- Added storage inspection and quarantine adapter methods.
- Wired the legacy confirm endpoint to return `MANUAL_REFUND_BATCH_WORKFLOW_REQUIRED` when the tenant flag is enabled, preserving the disabled path.
- Added session authentication-time lookup needed by break-glass.

## TDD evidence

RED:

```text
12 Task 3 suites failed to load because their production use-case modules were absent.
```

GREEN (delivered scope):

```text
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/{list-tenant-manual-refunds,get-tenant-manual-refund,verify-manual-refund-destination,claim-manual-refund,reassign-manual-refund,reject-manual-refund,reopen-manual-refund-destination,create-manual-refund-evidence-upload,submit-manual-refund-transfer}.use-case.spec.ts
9 files passed, 11 tests passed
```

```text
pnpm --filter=@booking/api lint
passed
```

## Authorized completion of the security-sensitive scope

- Implemented audited reveal behind `tenant.refunds.reveal`. The tenant-scoped operation lookup and audit commit happen before decryption or receipt presigning. The response exposes only the full destination and short-lived private download grant, carries `Cache-Control: no-store`, and never exposes the object key.
- Implemented checker approval behind `tenant.refunds.approve`. Maker/checker separation is enforced even on idempotent retries. CAS completion, all incomplete manual child refunds, batch refresh, audit, and the single batch-level `refund.completed` outbox event share one tenant transaction.
- Implemented Platform Admin break-glass in a separate platform-audience controller behind `platform.refunds.break_glass`. It requires a session authenticated in the previous five minutes before the tenant transaction is opened, a trimmed reason, explicit `BREAK_GLASS` confirmation, maker separation, and high-severity audit metadata.
- Completion responses are deliberately minimal (`id`, status, version, completed timestamp). Audit and outbox payloads contain no destination ciphertext, fingerprint, account number, account name, or receipt object key.
- Repeated completion returns the already-completed projection without another child update, audit, or outbox event.

Additional RED captured during review:

```text
2 focused tests failed because the first idempotent-completion implementation returned success
to the original maker after the operation was already completed.
```

Final focused GREEN:

```text
3 files passed, 11 tests passed
```

Final repository verification:

```text
pnpm test
382 files passed, 2035 tests passed

pnpm turbo lint typecheck build
24 tasks successful, 24 total
```

No deployment, seed, push, migration execution, shared-environment endpoint call, or real payment data access was performed.

## Review fix round 1

Addressed:

- Tenant mutation use cases now return explicit safe projections; account name, ciphertext, key version, fingerprint, and object keys stay internal.
- Reopen atomically invalidates all pending/claimed evidence rows, then quarantines their objects after the committed transaction so stale receipts cannot be reused.
- Invalid receipt inspection commits the DB quarantine state before moving the object, avoiding rollback to a pending row whose object is gone.
- Private-file inspection enforces the streamed byte limit rather than trusting only `Content-Length`.
- Approval and break-glass revalidate the claimed evidence row and object checksum, MIME, and size before completion.
- Added UUID validation to every tenant mutation/reveal `:id` route and corrected reopen to use `ReopenManualRefundDto`.
- Stale upload grants now throw `ManualRefundConcurrentUpdate` (409).

Review RED/GREEN:

```text
RED: focused review suites initially failed on missing claimed-evidence revalidation and the new reopen dependency.
GREEN: 9 files passed, 22 tests passed; after added lifecycle, stale-version, and hard-size tests, 9 files passed, 22 tests passed.
```

Fresh full verification:

```text
pnpm test && pnpm turbo lint typecheck build
24 turbo tasks successful; Vitest and all checks passed.

## Review fix round 2

Addressed:

- Approval and break-glass now retire a present but mutated/unavailable claimed evidence row inside the tenant transaction, commit that quarantine state, quarantine the opaque object after commit, and preserve the named `ManualRefundEvidenceRequired` 4xx even when storage quarantine fails.
- The evidence repository quarantine CAS now accepts both pending and claimed rows and clears claim metadata, preventing a failed revalidation from being retried as usable evidence.
- Reopen now returns its committed safe workflow projection when post-commit object quarantine fails. Quarantined rows retain the opaque key as a durable private retry signal, and a best-effort operational audit records only the failed object count (never an object key or PII).

Review RED:

```text
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/approve-manual-refund.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/break-glass-complete-manual-refund.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/reopen-manual-refund-destination.use-case.spec.ts
3 files failed; 3 tests failed, 12 passed (the two revalidation-retirement assertions and reopen storage-failure assertion).
```

Review GREEN:

```text
3 files passed; 15 tests passed.
```

Full verification:

```text
pnpm test && pnpm turbo lint typecheck build
382 test files passed, 2042 tests passed; 24 turbo tasks successful, 24 total.
```

Operational note: object quarantine is intentionally best-effort after the committed tenant state change; quarantined evidence rows remain unusable and retain an opaque retry signal, while storage failures are audited without sensitive data.
```
