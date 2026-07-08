# Task 2.8 — Automatic partner penalties

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §8.5

## Goal
Wrongful partner cancellations/no-show markings carry automatic financial consequences.

## Scope
- [ ] Penalty rules (configurable per tenant): partner cancellation, wrongful no-show marking (after customer dispute upheld)
- [ ] Penalty deducted from partner payout via ledger entries (not ad-hoc adjustments)
- [ ] Visibility: partner sees penalties + reasons; tenant sees rates and enforcement history

## Definition of Done
- Penalty journals balance; dispute-upheld path reverses the no-show and charges the penalty in one transaction
