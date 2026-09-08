# Manual Refund V2 Implementation Plan

## Context

SePay BANK_TRANSFER does not provide a safe payer account destination. Manual refunds therefore need a durable, provider-neutral batch workflow in which the customer supplies a verified receiving account, a finance maker records the external transfer, and an independent checker approves private evidence before the existing refund completion event is emitted.

## Global Constraints

- Preserve automatic refund behavior and the meaning of existing `RefundStatus` and `RefundBatchStatus` values.
- Scope every new persistent record by tenant, use `TenantDbService.forTenant`, hand-write migrations, force RLS, and use CAS for state transitions.
- Model one operation per `RefundBatch`; one transfer reference and receipt cover the whole batch, including multiple child refunds.
- Store account numbers only as dedicated versioned AES-256-GCM ciphertext with AAD, plus HMAC fingerprint and last four digits. Never expose full account data in list responses, logs, audit payloads, or outbox payloads.
- Customer access is either an authenticated session or the existing booking-code/email-OTP grant, always scoped to the same tenant and booking.
- Name mismatch blocks progression. Unsupported lookup enters manual verification; finance cannot override a mismatch.
- Maker and checker must differ. Platform break-glass requires fresh authentication and a reason, and is audited at high severity.
- Completion is atomic: all manual child refunds succeed, the batch and operation complete, audit is written, and exactly one `refund.completed` outbox event is emitted.
- Receipt upload is private, restricted to PDF/JPEG/PNG up to 10 MB, MIME-sniffed/quarantined/claimed before approval.
- Full account ciphertext is purged 90 days after completion; fingerprint, last4, bank code, transfer reference, consent, and audit remain.
- `manual_refund_v2` defaults off and is enabled per tenant. Existing manual batches backfill to `awaiting_details` only for opted-in tenants and never auto-complete.
- Follow repository test policy: use-case unit tests plus architecture guards only; verify browser flows by running the app/probes, not by adding an E2E test suite.
- No production deploy, no new real debit, no fake production callback, and no customer/studio production data.

## Task 1: Domain, contracts, schema, migration, and secure persistence

- Extend payment contracts with operation states, masked destination/status/list/detail responses, destination submission, verification, claim/reassign, transfer submission, approval/rejection/reopen, customer acknowledgement, and break-glass inputs.
- Add `ManualRefundOperation` and destination/evidence persistence at RefundBatch level, including one-operation-per-batch and tenant-normalized unique transfer reference.
- Add the `manual_refund_v2` tenant flag and the four permission keys with role defaults.
- Hand-write the migration, enable/force RLS, grant app roles, add indexes/checks, and backfill opted-in `manual_required` batches to `awaiting_details` without completing them.
- Implement a framework-free operation state entity/policy, named DomainErrors, repository ports/adapters, a dedicated PII crypto port/adapter with versioned keyring/AAD/HMAC fingerprint, and account-name lookup port with an explicit unsupported adapter.
- Use strict TDD: write focused failing use-case/domain tests first, run them red, add minimal implementation, then run green. Do not add forbidden integration/controller/repository tests.

## Task 2: Customer destination and status API

- Create use cases and controllers for customer operation status, submit/update destination, acknowledge received, and report not received.
- Authorize by authenticated customer ownership or existing booking access grant; enforce tenant and booking scoping, replay resistance, and rate limiting using existing primitives.
- Verify account names through the lookup port. Match advances to `ready_for_transfer`; unsupported/error advances to `verification_required`; mismatch produces a blocking correction state with no finance override.
- Allow a third-party destination only with recorded OTP consent. Before maker claim, customer may replace it; after claim, replacement requires checker reopen.
- Return masked data only and never serialize ciphertext/fingerprint.
- Add one use-case spec beside every new use case, demonstrating red then green.

## Task 3: Tenant maker-checker API, private evidence, and legacy gate

- Add tenant list/detail, manual verification, claim/reassign, audited reveal, submit transfer, approve/reject, reopen destination, and platform break-glass use cases/controllers.
- Enforce permissions `tenant.refunds.prepare`, `tenant.refunds.approve`, `tenant.refunds.reveal`, and `platform.refunds.break_glass`; reveal is audited and HTTP responses use `Cache-Control: no-store`.
- Claim and all state transitions use CAS. Reopen invalidates prior transfer draft and evidence. Normalize references and map duplicate uniqueness to HTTP 409.
- Reuse the private upload grant/claim pattern for receipts; PDF/JPEG/PNG only, 10 MB, MIME validation and quarantine required before transfer submission/approval.
- Checker cannot be maker. Break-glass requires fresh authentication and reason. Approval atomically succeeds every incomplete manual child, completes batch/operation, writes audit, and emits one batch completion.
- When the tenant flag is enabled, the legacy child-level confirm endpoint returns `409 MANUAL_REFUND_BATCH_WORKFLOW_REQUIRED`; it remains unchanged when disabled.
- Add one use-case spec beside every use case and preserve the existing error envelope.

## Task 4: SLA, notifications, purge, and operational recovery

- Create idempotent jobs/use cases for customer-detail reminders at 24/48 hours, transfer SLA starting only at `ready_for_transfer`, checker waiting/escalation, and full-account ciphertext purge 90 days after completion.
- Emit provider-neutral outbox events for destination requested/ready, transfer submitted, completed, and customer not-received without PII.
- Add email and in-app notification handling for required states; customer acknowledgement is follow-up only and never blocks completion or reverses money state.
- Ensure recovery is idempotent and existing automatic refund reconciliation remains unchanged.
- Add focused use-case specs for timers, idempotency, purge, and no-PII event payloads.

## Task 5: Tenant dashboard workflow

- Replace the child-level one-step confirm form for flagged tenants with a RefundBatch queue and detail workflow: awaiting customer, verification required, ready, in transfer, awaiting approval, overdue, needs correction, completed.
- Add BFF loaders/actions and centralized API paths. Use shared contracts and GenericForm; never fetch from the browser.
- Default to masked destination; reveal only on an explicit authorized action with a warning. Provide maker claim, private receipt upload, submit transfer, checker approve/reject, reopen, and break-glass UI states.
- Keep the legacy UI for unflagged tenants. Use semantic tokens, accessible labels/help/errors, clear amount copy, keyboard focus, and server-side validation.
- Verify with lint, typecheck, production build, and manual runtime flow; do not add frontend tests.

## Task 6: Customer storefront workflow

- Add localized booking refund status/destination pages and BFF actions for logged-in customers and booking email-OTP grants.
- Show exact refund amount/deadline, consent, verification/correction states, and only last4 after submit. Support third-party account consent and received/not-received follow-up.
- Use shared contracts/GenericForm, POST for sensitive data, server-side validation, semantic tenant theming, accessible status text, and no browser-to-backend fetch.
- Add reminder-link routing without exposing account data in URLs or logs.
- Verify with architecture guards, lint, typecheck, production build, and manual runtime flow; do not add frontend tests.

## Task 7: Documentation and complete verification

- Update TONG-QUAN, data model, settlement flow, finance reconciliation runbook, deployment/env docs, and `.env.example` for the PII keyring/fingerprint secret and feature rollout.
- Run `pnpm test` and `pnpm turbo lint typecheck build` from a clean worktree.
- Run the local app with disposable Postgres/Redis/storage and exercise customer OTP -> destination -> maker -> checker -> booking/settlement refunded, plus duplicate reference, name mismatch, tenant isolation, receipt rejection, maker-self-approval, and terminal 409 probes.
- Do not deploy. Report the implementation commit(s), verification evidence, rollout prerequisites, and any residual operational work.
