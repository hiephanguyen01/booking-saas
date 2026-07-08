# Task 2.3 — Role-builder UI (3 tiers)

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §14

## Goal
Admin, tenant and partner can each create custom roles from the permission catalog (foundation exists since Phase 0).

## Scope
- [ ] Role CRUD UI at platform / tenant / partner tiers; assign permissions from the catalog scoped to that tier
- [ ] Member management: invite user, assign role (`partner.members.manage`, `partner.roles.manage`, tenant equivalents)
- [ ] Audit log entries for role changes

## Definition of Done
- A tenant creates a "finance-only staff" role; that user sees only finance screens; audit trail recorded
