# Task 1.1 — Tenancy & domain mapping

**Phase:** 1 — Studio MVP · **Depends on:** Phase 0 · **Design refs:** TONG-QUAN.md §6, §7 (tenants, tenant_domains, plans)

## Goal
Platform admin can create a tenant, assign a plan, and map domains; limits and expiry are enforced.

## Scope
- [ ] Tenant CRUD (platform admin creates tenants manually — self-serve signup is Phase 3)
- [ ] `tenant_domains`: default subdomain (`*.bookingos.vn`) + custom domain with verification flow (token, DNS check job, `verified_at`); Host→tenant resolution with Redis cache (60s)
- [ ] Plans + manual subscription assignment; `subscription_plans.limits` jsonb
- [ ] `PlanLimitGuard` before create use cases; `maxBookingsPerMonth` is a soft limit (never blocks end-customer checkout — warn tenant instead)
- [ ] Expired subscription → storefront "suspended" page, dashboard read-only

## Definition of Done
- Two tenants on different hostnames resolve to isolated data; limit and expiry behaviors covered by tests
