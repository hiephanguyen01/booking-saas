# Task 2.10 — Advanced payouts & platform-fee reconciliation

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §13

## Goal
Payout operations scale beyond manual marking; platform fees are reconciled systematically.

## Scope
- [ ] Advanced payout screen: batch by cycle, holding-period awareness, export (bank file/CSV), status tracking
- [ ] Platform-fee reconciliation: expected vs collected per tenant per period, discrepancy report
- [ ] Audit trail on every payout action

## Definition of Done
- A payout cycle for N partners completes via batch flow; reconciliation report matches ledger totals to the đồng
