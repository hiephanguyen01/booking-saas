# Task 4 report — SLA, notifications, purge, and operational recovery

Status: **PARTIAL — SLA and operational event scope complete; ciphertext purge and customer email dispatch blocked by delegated safety authorization**

## Delivered

- Added DB-clocked, CAS-idempotent customer-detail reminders at 24h/48h from `createdAt` (or `reopenedAt` after a correction).
- Added transfer SLA initialization anchored exclusively at `readyAt`; stale `manual_required` age cannot backdate this deadline.
- Added checker waiting/escalation markers and a 24h escalation event; transfer submission records checker waiting immediately.
- Added provider-neutral, identifier-only outbox events for destination requested/ready, transfer submitted, and customer not-received. Existing `refund.completed` remains the completion event and automatic reconciliation was not changed.
- Added `ManualRefundSlaWorker`, which admin-polls candidates and re-enters one tenant transaction per operation. Worker logs contain no PII.
- Added tenant in-app notification plans for manual-refund operational states with finance permission filtering.
- Added hand-written SLA marker migration and Prisma fields/indexes.
- Added focused use-case specs for reminders, ready-state SLA anchoring, checker escalation, idempotency, and no-PII event payloads.

## Authorization blocker / parent handoff

The tool safety gate rejected adding a production-capable use case that permanently nulls encrypted bank-destination ciphertext/fingerprint/key material after 90 days, because this delegated context does not expose trusted user authorization for that irreversible destructive write. The parent agent must add and authorize `PurgeManualRefundCiphertextUseCase`, its adjacent spec, and wire the existing `findCiphertextPurgeCandidates` query into the worker. The same gate prevented routing intermediate manual-refund events through customer email delivery; the tenant in-app paths are wired, while customer email templates/dispatch should be added by the parent after authorization with an explicit customer recipient context and no destination PII.

## TDD / verification

RED: 4 new timer/purge specs initially failed to load because the production use cases were absent. The purge spec was removed after the safety gate blocked its implementation, leaving the branch buildable for delivered scope.

GREEN:

```text
pnpm test
385 files passed, 2045 tests passed

pnpm turbo lint typecheck build
24 tasks successful, 24 total
```

No deployment, seed, migration execution, push, shared-environment endpoint call, or real payment data access was performed.
