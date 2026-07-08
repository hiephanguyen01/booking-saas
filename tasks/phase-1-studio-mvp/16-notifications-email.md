# Task 1.16 — Notifications: email + reminders

**Phase:** 1 — Studio MVP · **Depends on:** 1.7, 1.9 · **Design refs:** TONG-QUAN.md §17

## Goal
Every important event notifies the right people by email, in the right locale.

## Scope
- [ ] Email adapter (mailpit in dev); templates per event: booking created/confirmed/cancelled/completed, payment received, refund, payout, listing approved/hidden, OTP
- [ ] Recipients per domain event (customer, partner, tenant) driven by the outbox
- [ ] Reminder job (upcoming booking reminders)
- [ ] Locale of the recipient (vi/en)

## Out of scope
Zalo ZNS (Phase 2 — but start OA registration paperwork during Phase 1).

## Definition of Done
- Every state-machine transition that requires a notification sends exactly one email (idempotent against outbox retries)
