# Phase 1 — Studio Vertical MVP

Goal: launch the studio vertical end-to-end — hourly + daily booking **and** inventory rental (with deposit) — with PayOS payment, commissions, basic promotions and dashboards.

| # | Task | Depends on |
|---|------|-----------|
| 01 | [Tenancy & domain mapping](01-tenancy-domains.md) | Phase 0 |
| 02 | [Partner onboarding & verification](02-partner-onboarding.md) | 01 |
| 03 | [Dynamic listing types](03-dynamic-listing-types.md) | 01 |
| 04 | [Listings, groups, modes & pricing](04-listings-groups-pricing.md) | 02, 03 |
| 05 | [Listing moderation & trust signals](05-listing-moderation.md) | 04 |
| 06 | [Scheduling & availability engine](06-scheduling-availability.md) | 04 |
| 07 | [Booking core & state machine](07-booking-core.md) | 06 |
| 08 | [Inventory mode (quantity + deposit)](08-inventory-mode.md) | 07 |
| 09 | [Payments (PayOS + mock)](09-payments.md) | 07 |
| 10 | [Finance: commissions, ledger, payouts](10-finance-ledger-payouts.md) | 09 |
| 11 | [Basic promotions](11-promotions-basic.md) | 09 |
| 12 | [Dashboard — platform admin](12-dashboard-admin.md) | 01, 10 |
| 13 | [Dashboard — tenant](13-dashboard-tenant.md) | 05, 10, 11 |
| 14 | [Dashboard — partner](14-dashboard-partner.md) | 07, 10 |
| 15 | [Storefront (studio template)](15-storefront-studio.md) | 06, 07, 11 |
| 16 | [Notifications (email + reminders)](16-notifications-email.md) | 07, 09 |
| 17 | [Seed data & E2E journey](17-seed-e2e.md) | all above |

**Phase Definition of Done:** `pnpm turbo lint typecheck test` green + Playwright E2E green + demo runs via `docker compose up` with seed data.
