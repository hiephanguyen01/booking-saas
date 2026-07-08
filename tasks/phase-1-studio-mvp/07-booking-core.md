# Task 1.7 — Booking core & state machine

**Phase:** 1 — Studio MVP · **Depends on:** 1.6 · **Design refs:** TONG-QUAN.md §8, §10

## Goal
The full booking lifecycle is safe under concurrency and covers guest checkout.

## Scope
- [ ] Full state machine incl. no-show and **request-to-book/approval**; all transitions through `booking.transitionTo(next, ctx)` — validates, writes `booking_status_history`, emits domain events
- [ ] Redis hold on slot selection (TTL) → draft booking (idempotent create)
- [ ] Postgres **exclusion constraint** as the final double-booking guard
- [ ] Cancellation policies + refund calculation per policy
- [ ] No-show marking + customer 72h dispute window (manual tenant handling)
- [ ] **Guest checkout**: booking by email, lookup/cancel via booking code + email OTP; guest can upgrade to full account
- [ ] `GET /public/my-bookings` for logged-in customers

## Definition of Done
- Race test: N parallel requests for one slot → exactly 1 succeeds; every valid/invalid transition unit-tested
