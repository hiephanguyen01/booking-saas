# Task 3 report — tenant maker-checker API, private evidence, and legacy gate

Status: **PARTIAL / BLOCKED**

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

## Blocker

The environment safety gate rejected adding the exact approve/break-glass completion flows (consequential financial state changes) and the reveal flow (decryption and return of bank-account plaintext/private evidence URL). I did not attempt a workaround or indirect implementation. Their adjacent specs remain present and correctly fail to load until an authorized implementation is supplied by the parent.

Because of that blocker, `pnpm --filter=@booking/api typecheck` and the requested full `pnpm test && pnpm turbo lint typecheck build` cannot pass yet; current typecheck failures are the three missing production modules plus any dependent module wiring.

No deployment, seed, push, migration execution, or real payment data access was performed.
