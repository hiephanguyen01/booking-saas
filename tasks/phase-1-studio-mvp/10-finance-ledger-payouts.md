# Task 1.10 — Finance: commissions, ledger, payouts

**Phase:** 1 — Studio MVP · **Depends on:** 1.9 · **Design refs:** TONG-QUAN.md §13

## Goal
Money is tracked in a double-entry ledger that always balances; partners get paid manually per cycle.

## Scope
- [ ] Commission rules + **snapshot at booking time** (rule changes never affect past bookings)
- [ ] Double-entry ledger; journal written on `BookingCompleted` (via outbox); constraint: total debit = total credit per journal
- [ ] Balances per partner/tenant/platform; holding period before payable
- [ ] Manual payout flow: mark paid, reference, audit log

## Definition of Done
- Property-style test: ledger balances across all scenario flows (full, deposit, refund, no-show); commission snapshot immutability tested
