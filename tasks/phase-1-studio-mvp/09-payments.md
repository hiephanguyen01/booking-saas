# Task 1.9 — Payments (SePay + mock)

**Phase:** 1 — Studio MVP · **Depends on:** 1.7 · **Design refs:** TONG-QUAN.md §11

## Goal
Plug-in payment architecture with SePay live and a mock gateway for local development. A legacy PayOS adapter remains for compatibility but is not exposed by the current dashboard.

## Scope
- [x] `PaymentGateway` port; adapters: `sepay`, `mock` (legacy `payos` retained)
- [x] Instant full payment + deposit (partial) flows; `POST /public/bookings/:id/checkout` → normalized checkout destination
- [x] Webhook endpoint per gateway (raw body, signature verification), **idempotent** processing
- [x] Refunds: gateway API where supported, `manual_required` fallback
- [x] Reconciliation job for lost webhooks (poll gateway by orderCode)
- [x] Projection recovery for succeeded payment/refund and durable cancellation refund intent
- [x] Successful payment emits `payment.succeeded` and creates a Tenant-held settlement
- [x] Partner completion confirms on-site collection and opens the dispute window
- [x] Post-dispute worker releases settlement and atomically creates the revenue journal
- [x] Deposit percentage guard + exact booking-time commission coverage check
- [x] Tenant settlement register and Partner/Tenant booking settlement detail
- [x] Customer dispute → Partner response → Tenant release/full/partial-refund workflow
- [x] Guarded payout state machine + per-booking payout allocations
- [x] Tenant manual-refund confirmation with bank reference/evidence
- [x] Detailed operations guide: `docs/settlement-flow.md`
- [x] Incident/rollout runbook: `docs/runbooks/finance-reconciliation.md`

## Verification
- `pnpm --filter=@booking/contracts build`
- `pnpm --filter=@booking/api typecheck`
- `pnpm --filter=@booking/api check:rls`
- `pnpm --filter=@booking/dashboard typecheck`
- Run one SePay sandbox payment and verify `held → dispute_window → released → payout` using the
  runbook. Automated tests are intentionally prohibited by ADR 0005.
