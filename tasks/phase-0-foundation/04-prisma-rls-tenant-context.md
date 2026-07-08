# Task 0.4 — Prisma schema, RLS & tenant context

**Phase:** 0 — Foundation · **Depends on:** 0.3 · **Design refs:** TONG-QUAN.md §6, §7

## Goal
Multi-tenant data isolation is in place and proven by a test before any business feature is built.

## Scope
- [ ] First-pass Prisma schema + initial migration (core tables: users, tenants, tenant_domains, plans/subscriptions, permission catalog)
- [ ] Manual SQL migrations for RLS policies (kept alongside Prisma migrations)
- [ ] Tenant-context middleware (AsyncLocalStorage) — tenant resolved from session/Host, never trusted from client payload
- [ ] Prisma extension `forTenant()`: `SET LOCAL app.tenant_id` inside a transaction; business code never uses the raw client
- [ ] Platform-admin path documented: separate connection that bypasses RLS
- [ ] **First RLS isolation test** (Testcontainers): tenant A cannot read tenant B

## Definition of Done
- RLS isolation test green in CI; a repository query without tenant context fails loudly rather than leaking data
