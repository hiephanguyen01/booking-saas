# Task 2.1 — Affiliate system (full)

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §15, §7 (affiliate group)

## Goal
Affiliates drive traffic via links and earn commission on resulting bookings.

## Scope
- [ ] Affiliate signup + approval; affiliate dashboard area
- [ ] Links `?ref=CODE`; cookie attribution (window, last-click policy)
- [ ] Commission lifecycle: pending on booking → confirmed on completion → payable after holding period; reversal on refund/cancel
- [ ] Constraint enforced: `platform% + affiliate% ≤ tenant%` (UI + domain validation)
- [ ] Affiliate payout flow + reports

## Definition of Done
- Attribution test across cookie window edge cases; ledger stays balanced with affiliate legs included
