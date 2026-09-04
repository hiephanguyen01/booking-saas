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
