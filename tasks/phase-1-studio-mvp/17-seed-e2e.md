# Task 1.17 — Seed data & E2E journey

**Phase:** 1 — Studio MVP · **Depends on:** all Phase 1 tasks · **Design refs:** TONG-QUAN.md §21, §22, KICH-BAN-CHAY-THU.md

## Goal
The whole vertical is provable with one command; regressions are caught by E2E.

## Scope
- [ ] Seed: 1 studio tenant, 2 partners, listing types + listings (hourly/daily/inventory), roles, promo codes — mirroring KICH-BAN-CHAY-THU.md scenarios
- [ ] Playwright E2E: book → pay (mock gateway) → complete → ledger check; cancel + refund path; **one case using a discount code**
- [ ] E2E wired into CI

## Definition of Done
- `docker compose up` + seed → E2E suite green; demo walkthrough possible on seeded data
