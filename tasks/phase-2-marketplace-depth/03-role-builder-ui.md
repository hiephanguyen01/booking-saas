# Task 2.3 — Role-builder UI (3 tiers)

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §14

## Goal
Admin, tenant and partner can each create custom roles from the permission catalog (foundation exists since Phase 0).

## Scope
- [x] Role CRUD UI at the **tenant** tier; assign permissions from the catalog scoped to that tier —
      **platform and partner tiers remain open**
- [x] Member management (**tenant** tier): invite user, assign role
      (`tenant.members.manage` / `tenant.roles.manage`) — the **partner**-tier equivalents
      (`partner.members.manage` / `partner.roles.manage`) remain open
- [x] Audit log entries for role changes (**tenant** tier only)

## Definition of Done
- A tenant creates a "finance-only staff" role; that user sees only finance screens; audit trail recorded

**Status (2026-08-13):** The tenant tier is implemented and verified end-to-end — role CRUD, staff
invite + OTP registration + accept, per-member multi-role assignment with a union effective-permission
preview, sidebar/route enforcement down to the single-permission role, and the seven safety invariants
(self-edit lockout, last-manager lockout, permission escalation, role-in-use, roles-gone-on-accept,
email-mismatch, concurrent-accept race). See
[`.superpowers/sdd/2026-08-13-tenant-staff-rbac/`](../../.superpowers/sdd/2026-08-13-tenant-staff-rbac/)
for the plan and per-task reports. The **platform** and **partner** tiers described in this ticket's
original scope are **still open** — no platform-tier or partner-tier role/member UI exists yet.
