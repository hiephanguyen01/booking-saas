# Task 4 report — SLA, notifications, purge, and operational recovery

Status: **COMPLETE — SLA, operational events, ciphertext purge, and customer notifications implemented and statically verified**

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

## Authorized completion — ciphertext purge and customer notification delivery

The parent supplied explicit code-only authorization for the two previously blocked parts. No purge
was run and no live email was sent.

- Added `PurgeManualRefundCiphertextUseCase` and wired it into the existing manual-refund sweep.
  It reads the DB clock inside one tenant transaction, requires `completedAt <= DB now - 90 days`,
  and calls a tenant/status/version-scoped CAS. The repository nulls only the full account ciphertext
  and its encryption-key version, stamps `ciphertextPurgedAt`, and increments the version. Bank code,
  fingerprint, last4, consent, transfer reference, receipt evidence, and audit records remain.
- Added a hand-written constraint migration that admits the post-purge retained metadata bundle and a
  partial index for due purge candidates. The migration was authored but deliberately not executed.
- Added customer email dispatch for destination requested, 24h and 48h reminders, destination ready,
  transfer submitted/checker wait, completed, and customer not-received. Templates receive only
  booking/customer presentation fields and refund amount; account ciphertext, fingerprint, full
  account number, and evidence object keys are neither read nor forwarded.
- Completion uses a manual-refund-specific email while sharing the canonical `booking.refunded`
  customer dedupe identity. The later booking event therefore cannot send a duplicate completion
  email. Automatic refund reconciliation was not changed.
- Fixed tenant in-app manual-refund subjects to resolve booking code from `RefundBatch`, and included
  the non-PII `hours` discriminator so both 24h and 48h reminders are independently idempotent.
- Guarded the shared `refund.completed` handler against legacy single-refund events that do not carry
  a `refundBatchId`, so automatic-refund outbox delivery cannot fail on a missing UUID.

TDD evidence:

```text
RED purge: 2 tests failed with "Not implemented".
GREEN purge: 2/2 passed.

RED customer dispatcher: 3 tests failed with "Not implemented".
GREEN customer dispatcher: 3/3 passed.

RED in-app reminder identity: expected refund_batch_booking_code/24h+48h keys but received the old
booking_code/shared key path.
GREEN focused scope: 3 files passed, 14 tests passed.
```

Fresh full verification:

```text
pnpm test
387 files passed, 2052 tests passed

pnpm turbo lint typecheck build
24 tasks successful, 24 total
```

No deploy, push, seed, migration execution, local/shared purge, staging call, live mail, or real-data
access was performed.
