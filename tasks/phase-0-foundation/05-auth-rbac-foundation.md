# Task 0.5 — Auth & RBAC foundation

**Phase:** 0 — Foundation · **Depends on:** 0.4 · **Design refs:** TONG-QUAN.md §14, §20

## Goal
Anyone can register/login; every non-public endpoint is permission-guarded, deny-by-default.

## Scope
- [ ] `POST /auth/register | /auth/login | /auth/refresh | /auth/logout`
- [ ] Argon2id password hashing; login rate limit; temporary lockout after N failures
- [ ] Session cookie (httpOnly, SameSite=Lax) + refresh rotation
- [ ] Seed permission catalog + system roles (platform admin, tenant admin, partner, customer)
- [ ] `PermissionsGuard` on every non-public endpoint — deny-by-default
- [ ] CSRF protection baseline

## Out of scope
Email verification, password reset, guest OTP (Phase 1) · role-builder UI (Phase 2) · social login (backlog).

## Definition of Done
- Auth flow works end-to-end against the running API; an endpoint without an explicit permission is rejected
