# Task 2.3 — Role-builder UI (3 tiers)

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §14

## Goal
Admin, tenant and partner can each create custom roles from the permission catalog (foundation exists since Phase 0).

## Scope
- [x] Role CRUD UI at the **tenant** tier; assign permissions from the catalog scoped to that tier —
      the **partner** tier deliberately ships **no** role CRUD (a fixed two-role catalog, Partner Owner
      / Staff, with no create/edit/delete-role screen or endpoint) — **platform tier remains open**
- [x] Member management: **tenant** tier (invite user, assign role — `tenant.members.manage` /
      `tenant.roles.manage`) and **partner** tier (invite user, assign role from the fixed system-role
      catalog — gated on the single `partner.members.manage` permission; `partner.roles.manage` stays
      reserved in the permission catalog, unused, since the partner tier has no role CRUD to gate) are
      both done — **the platform-tier equivalent remains open**
- [x] Audit log entries for role changes (**tenant** tier only — partner has no role CRUD to audit) and
      for member-management changes (`partner_member.invited` / `.roles_changed` / `.removed`, **tenant**
      and **partner** tiers) — **platform tier remains open**

## Definition of Done
- A tenant creates a "finance-only staff" role; that user sees only finance screens; audit trail recorded

**Status (2026-08-13):** The tenant tier is implemented and verified end-to-end — role CRUD, staff
invite + OTP registration + accept, per-member multi-role assignment with a union effective-permission
preview, sidebar/route enforcement down to the single-permission role, and the seven safety invariants
(self-edit lockout, last-manager lockout, permission escalation, role-in-use, roles-gone-on-accept,
email-mismatch, concurrent-accept race). See
[`.superpowers/sdd/2026-08-13-tenant-staff-rbac/`](../../.superpowers/sdd/2026-08-13-tenant-staff-rbac/)
for the plan and per-task reports.

**Status (2026-08-14):** The partner tier is implemented and verified end-to-end on the same shared
invitation machinery — partner-scoped invite, OTP registration + accept, member list/remove and
per-member role assignment from the fixed Partner Owner / Staff catalog, sidebar/route enforcement down
to the Staff permission set, and the lockstep invariant between `partner_members` and partner-scope
`role_assignments` (every accept/removal keeps both tables non-zero or both zero together — verified by
direct query, not just through the UI). Self-edit lockout is confirmed live (`CANNOT_EDIT_SELF`, 400).
The last-manager lockout (`assertKeepsAManager` / `LastManagerRemoved`) is real and shared with the
tenant tier's guard, but — unlike the tenant tier, where a role edit can strip `tenant.members.manage`
out from under its holders including the actor (`UpdateTenantRoleUseCase` has no self-edit check by
design) — the partner tier has no role CRUD to edit, and its one combined permission gate means the
acting manager always retains `partner.members.manage` through any member-level write, so this refusal
is structurally unreachable via the live product today; confirmed by tracing both use-cases and by
reproducing the boundary case (demoting the second Partner Owner to Staff succeeds normally; a further
attempt on the sole remaining manager's own role hits `CANNOT_EDIT_SELF`, never `LastManagerRemoved`).
See [`.superpowers/sdd/2026-08-13-partner-staff-rbac/`](../../.superpowers/sdd/2026-08-13-partner-staff-rbac/)
for the plan and per-task reports. Only the **platform** tier described in this ticket's original scope
is **still open** — no platform-tier role/member UI exists yet.
