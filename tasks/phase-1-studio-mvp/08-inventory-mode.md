# Task 1.8 — Inventory mode (quantity + deposit)

**Phase:** 1 — Studio MVP · **Depends on:** 1.7 · **Design refs:** TONG-QUAN.md §9.4

## Goal
Outfit/equipment rental by quantity with security deposits — StudioHub launches with 4 of 5 listing types.

## Scope
- [ ] `inventory` mode: stock per listing, quantity selection, availability = stock minus overlapping rentals
- [ ] Security deposit (thế chân): collected with payment, refunded on return
- [ ] Late-return handling: overdue detection, fee calculation, deposit deduction flow
- [ ] Booking state machine extensions for pickup/return

## Definition of Done
- Inventory race test: N parallel requests for the last unit → stock never exceeded; deposit + late-fee math unit-tested
