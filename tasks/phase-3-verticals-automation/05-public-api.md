# Task 3.5 — Public API + API keys

**Phase:** 3 — Verticals & Automation · **Design refs:** TONG-QUAN.md §19

## Goal
Large tenants integrate programmatically.

## Scope
- [ ] API-key issuance/rotation/revocation per tenant; scoped permissions reusing the RBAC catalog
- [ ] Public API surface (read listings/availability, manage bookings) — versioned, rate-limited per key
- [ ] OpenAPI docs generated from zod contracts
- [ ] Usage metering per key (feeds plan limits)

## Definition of Done
- A demo integration books via API key end-to-end; revoked key fails immediately; docs published
