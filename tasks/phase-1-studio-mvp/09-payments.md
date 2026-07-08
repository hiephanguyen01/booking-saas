# Task 1.9 — Payments (PayOS + mock)

**Phase:** 1 — Studio MVP · **Depends on:** 1.7 · **Design refs:** TONG-QUAN.md §11

## Goal
Plug-in payment architecture with PayOS live and a mock gateway for tests.

## Scope
- [ ] `PaymentGateway` port; adapters: `payos`, `mock`
- [ ] Instant full payment + deposit (partial) flows; `POST /public/bookings/:id/checkout` → paymentUrl
- [ ] Webhook endpoint per gateway (raw body, signature verification), **idempotent** processing
- [ ] Refunds: gateway API where supported, `manual_required` fallback
- [ ] Reconciliation job for lost webhooks (poll gateway by orderCode)

## Definition of Done
- Idempotency test: 5 duplicate webhook deliveries → exactly 1 payment recorded; refund paths (API + manual) covered
