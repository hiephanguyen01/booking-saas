# Tenant Staff & Roles (RBAC write path)

## Goal

Let a tenant run its own staff: invite people, give them roles, change or revoke those roles, and
define custom roles from the tenant permission catalog — all from the tenant console, without a DBA
running SQL.

The RBAC *foundation* has existed since Phase 0. What is missing is the write path. Today the only
ways a `role_assignments` row is ever created are the seed
(`prisma/seed/shared.ts:253`, `prisma/seed/platform.ts:55`) and partner approval
(`prisma-partner.repository.ts:308`). The two permission keys that would authorize staff management,
`tenant.members.manage` and `tenant.roles.manage`, are declared in the catalog and referenced by **no
route in the codebase** — as are `partner.members.manage`, `partner.roles.manage`,
`platform.users.manage` and `platform.roles.manage`.

Implements the tenant half of `tasks/phase-2-marketplace-depth/03-role-builder-ui.md`.

## Scope

**In:** a `tenant_invitations` table; tenant-tier member and role endpoints in `identity-access`; an
invitation email delivered through the outbox; a `/tenant/members` screen with three tabs; full-page
invite / edit-member / create-role / edit-role forms; an invitation-accept screen outside the tenant
area.

**Out:** the partner and platform tiers (same use-cases and components, later); an audit-log
*viewer* (entries are still written); per-partner or per-branch scoping of a staff member; resending
an invitation (revoke and re-invite); transferring tenant ownership; suspending a member (removal
only); 2FA/SSO. No change to `PermissionsGuard`, `PermissionResolverService` or
`PrismaSessionInfoReader` — they are *called*, never modified — and **no new permission keys**, so no
seed run is required.

## Decisions

| Question | Decision |
| --- | --- |
| A separate "staff" concept? | **No.** A tenant staff member *is* a user with a `role_assignments` row where `tenant_id` is set and `partner_id` is null. No `TenantMember` table. The `Staff` model (`schema.prisma:2383`) is unrelated — it is a partner's bookable practitioner for Phase 3 appointments. |
| Roles, or per-user permission ticks? | **Roles.** See *Why roles* below. |
| Multiple roles per user? | **Yes — already supported, nothing to build.** Exposed as multi-select. |
| How someone joins | A **stateful invitation** with a token and an expiry, so a person who has no account yet can still be invited, and a pending invite can be revoked. |
| Where the code lives | `identity-access`. Roles, permissions and assignments are its domain; `tenancy` does not own them. |
| Escalation rule | A caller may only grant permissions they themselves hold. |
| Subscription gating on staff/role writes | **Not gated.** An owner must be able to revoke a departed employee's access exactly when billing has lapsed, not lose the ability to. |

### Why roles, not per-user permission ticks

Ticking permissions directly onto a person reads simpler for a 2–10 person tenant, and it was
seriously considered. Three findings decided against it:

1. **Tenant membership is *derived from* `role_assignments`.** `PrismaSessionInfoReader.listMemberships`
   (`prisma-session-info.reader.ts:24-40`) builds the entire workspace list from that table. A user
   with permissions but no assignment would have no tenant workspace at all. Supporting per-user
   grants therefore means adding a second permission source and editing both
   `PrismaSessionInfoReader` and `PermissionResolverService` — the two files `AGENTS.md` singles out
   as load-bearing for tenant isolation. That is a poor trade for authoring convenience.
2. **The reverse question becomes unanswerable cheaply.** "Who can see finance?" is one query against
   roles and a full scan against per-user grants. That question matters most at the moment it is
   hardest — offboarding.
3. **Policy changes multiply.** Eight receptionists gaining one permission is one role edit, or eight
   member edits.

The real complaint about roles is *ordering* — having to create a role before you can invite anyone.
That is a UI problem, not a data-model problem, and is solved by creating roles inline inside the
invite form.

### Multi-role is already supported end to end

No work is needed at the data or resolution layer; only the UI and contracts must stop assuming one
role per person.

- `migrations/20260708000001_rls_roles_policies/migration.sql:80-82` — the unique index is
  `(user_id, role_id, tenant_id, partner_id)` `NULLS NOT DISTINCT`. Because `role_id` is part of the
  key, many roles per `(user, tenant)` are legal; only assigning the *same* role twice is blocked.
- `permission-resolver.service.ts:36-48` — loads every assignment in the scope and **unions** their
  permission keys.
- `prisma-session-info.reader.ts:70` — `membership.roles` is already an array.

Consequences for this design: the invite and edit forms use a **multi-select**; the member row shows
several role chips; editing a member **replaces the whole role set** (the server diffs it into adds
and removes); an invitation carries `role_ids[]`. Because effective permissions are a union, both
forms show a read-only **effective-permission preview** — nobody can add two role sets in their head.

## Data Model

One new table. `roles`, `role_permissions` and `role_assignments` are unchanged; custom roles already
fit via `Role.tenantId` with `isSystem = false`.

```
tenant_invitations
  id                 uuid pk
  tenant_id          uuid not null            -- RLS
  email              citext not null
  role_ids           uuid[] not null
  token_hash         text not null unique     -- SHA-256, same convention as sessions
  invited_by_user_id uuid not null
  status             enum(pending, accepted, revoked) not null default 'pending'
  expires_at         timestamptz not null     -- 7 days
  accepted_at        timestamptz
  accepted_user_id   uuid
  created_at, updated_at timestamptz not null
```

- Hand-written migration with `FORCE ROW LEVEL SECURITY` and a `tenant_isolation` policy, then
  `prisma:deploy`, then `check:rls` (ADR 0004).
- Partial unique index: one `pending` invitation per `(tenant_id, email)`.
- "Expired" is derived (`status = 'pending' AND expires_at < now()`), not a stored state.
- `role_ids` is an array rather than a join table. An invitation lives seven days, so the missing FK
  is handled at accept time: intersect with the tenant's existing roles, and fail with a clear error
  if nothing remains. This trades referential integrity for one fewer table and RLS policy — a
  deliberate, bounded exception to the usual preference for a join table.

## API

All under `identity-access`, two controllers, one class and one audience per file:
`tenant-member.controller.ts`, `tenant-role.controller.ts`.

| Method | Path | Declares |
| --- | --- | --- |
| GET | `/tenant/members` | `tenant.members.manage` |
| GET | `/tenant/members/invitations` | `tenant.members.manage` |
| POST | `/tenant/members/invitations` | `tenant.members.manage` |
| DELETE | `/tenant/members/invitations/:id` | `tenant.members.manage` |
| PUT | `/tenant/members/:userId/roles` | `tenant.members.manage` |
| DELETE | `/tenant/members/:userId` | `tenant.members.manage` |
| GET | `/tenant/roles/assignable` | `tenant.members.manage` |
| GET | `/tenant/roles` | `tenant.roles.manage` |
| POST | `/tenant/roles` | `tenant.roles.manage` |
| PATCH | `/tenant/roles/:id` | `tenant.roles.manage` |
| DELETE | `/tenant/roles/:id` | `tenant.roles.manage` |
| GET | `/auth/invitations/:token` | `@AuthenticatedOnly()` |
| POST | `/auth/invitations/:token/accept` | `@AuthenticatedOnly()` |

Two non-obvious shapes:

- **`/tenant/roles/assignable` is separate from `/tenant/roles`** because `@RequirePermissions` is
  **AND**, not OR (`permissions.guard.ts:47` — every listed key must be held). The invite form needs
  role names, but the person inviting does not necessarily hold `roles.manage`. The assignable
  endpoint returns `{id, name}` only.
- **Accepting must be `@AuthenticatedOnly()`.** The recipient has no membership in that tenant yet,
  so any `tenant.*` requirement would 403 exactly the people it is for. The tenant is read **from the
  invitation row**, never from the `x-tenant-id` header.

### Use-cases

One file, one `@Injectable`, one public `execute()` (hard rule 3):

`ListTenantMembers` · `InviteTenantMember` · `RevokeTenantInvitation` · `GetInvitationPreview` ·
`AcceptTenantInvitation` · `SetTenantMemberRoles` · `RemoveTenantMember` ·
`ListAssignableTenantRoles` · `ListTenantRoles` · `CreateTenantRole` · `UpdateTenantRole` ·
`DeleteTenantRole`

## Safety Invariants

1. **No lockout.** Reject any operation that would leave the tenant with nobody holding
   `tenant.members.manage`. Evaluated on *effective permissions*, not role names — a custom role can
   carry that key too.
2. **No self-edit.** A user cannot change or remove their own roles. Demotion goes through someone
   else.
3. **No escalation.** When creating or editing a role, and when assigning roles, the server compares
   the requested permission set against the caller's own effective permissions and **rejects with
   400 listing the disallowed keys** — it does not silently trim them, because a silently weakened
   role is worse than a refused one. `Tenant Owner` holds all 24 tenant keys and never notices; a
   holder of a custom role cannot exceed themselves.
4. **System roles are immutable.** `isSystem = true` cannot be edited or deleted. The UI offers
   "duplicate" instead.
5. **Deleting a role in use returns 409.** Mandatory, because `RoleAssignment.role` declares
   `onDelete: Cascade` (`schema.prisma:719`) — an unguarded delete would *silently* strip everyone
   holding it. The error reports how many members are affected.
6. **`PermissionResolverService.invalidate(userId)` after every change** (one argument). Omitting it
   leaves a removed member acting for up to `CACHE_TTL_SECONDS = 60`
   (`permission-resolver.service.ts:11`). This failure is silent — no throw, no log — so each write
   path carries a comment saying so.
7. **Audit through `IAuditWriter`, inside the same transaction**: `member.invited`,
   `member.roles_changed`, `member.removed`, `role.created`, `role.updated`, `role.deleted`.

Two edge cases the above leaves open, resolved here:

- **Accepting when already a member of that tenant** — the invitation's roles are **added** to the
  existing set, not swapped for it. Re-inviting an existing member is therefore a way to grant extra
  roles, and never a way to quietly remove one.
- **A removed member's live session stays valid.** Removal deletes assignments and invalidates the
  permission cache; it does not revoke `sessions` rows. Within a minute the user keeps a signed-in
  session but loses the tenant workspace entirely — `listMemberships` no longer returns it. Session
  revocation on removal is deliberately out of scope.

Every other tenant-settings mutation (`tenant-legal`, `tenant-settings`, theme, domains, …) locks to
read-only once `evaluateSubscription(...).dashboardWritable` is false, via
`RequireActiveSubscriptionGuard`. The `/tenant/members` and `/tenant/roles` writes in this design are
not gated that way, deliberately: staff and role management must stay available when a subscription
lapses, because that is exactly when a tenant most needs to revoke a departed employee's access, not
when it can afford to lose the ability to. (`RequireActiveSubscriptionGuard` also lives in `tenancy`,
which already imports `identity-access`'s decorators in five controllers, so importing it back into
`identity-access` would close a module cycle `check:module-cycles` rejects — the product decision and
the import-graph constraint happen to point the same way.)

## Email

`InviteTenantMember` emits `tenant.member_invited` via `OutboxService.emit(tx, …)` inside its
`forTenant` transaction; `notification` registers the handler (ADR 0003). A direct send would let the
mail escape a rolled-back invitation.

**The link must point at the tenant's own console host.** Since the dashboard became host
multi-tenant, `/tenant` exists only on `admin.<slug>.<domain>`. The backend builds the URL from the
tenant's `tenant_domains` row with `kind = 'dashboard'`, `is_primary`, verified — the same source
`prisma-session-info.reader.ts:30-36` reads. A link to the platform host strands the recipient.

## Contracts

Add `packages/contracts/src/contracts/access.ts` exporting `tenantPermissionKeySchema` (the 24 tenant
keys) plus the member, invitation and role request/response schemas.
`identity-access/domain/permission-catalog.ts` builds its tenant section **from that schema**, so the
two cannot drift. Vietnamese labels for each key live in the dashboard's `constants/`, typed from the
enum — the convention in `apps/dashboard/CLAUDE.md` → *Constants*.

## Frontend

### Navigation

One new item, **"Nhân sự"**, in the *Hệ thống* group of `routes/tenant/nav.ts`, gated with
`anyPermissions: ['tenant.members.manage', 'tenant.roles.manage']` — the same mechanism "Cài đặt"
already uses. One item, not two: the sidebar already carries 15+.

### `/tenant/members` — three tabs

Tab selection via a query param, mirroring `dashboardPaths.tenant.settingsSection`.

| Tab | Content | Gate |
| --- | --- | --- |
| Thành viên | person · role chips · joined · actions | `tenant.members.manage` |
| Lời mời | pending · expired · revoke | `tenant.members.manage` |
| Vai trò | system roles (locked) + custom · holder count | `tenant.roles.manage` |

A tab whose permission the caller lacks is not rendered.

This is a **new route, not a tab inside `/tenant/settings`**. That screen is already a large tabbed
page funnelling every form through one `handleSettingsAction`; staff management is also a recurring
operational task rather than a setting.

### Forms

Per `apps/dashboard/CLAUDE.md` → *Full-page forms*: `FormPage` with a single `FormSurface` (under
three sections, so no `FormWizard`).

**`/tenant/members/invite`** — three sections:
1. **Người được mời** — email.
2. **Vai trò** — multi-select, plus a **"Tạo vai trò mới"** button that expands an inline
   permission-tick panel without leaving the page. Shown only when `can('tenant.roles.manage')`.
3. **Quyền hiệu dụng** — read-only union of the selected roles, grouped by domain (Danh mục / Vận
   hành / Tài chính / Tiếp thị / Hệ thống).

**`/tenant/members/:userId`** reuses those same section bodies through a `mode` prop, minus the email
field — create and edit never grow a second copy.

**`/tenant/roles/new`** and **`/tenant/roles/:roleId/edit`** — name plus a 24-permission tick grid
grouped by domain. A system role opens read-only with a **"Nhân bản"** action.

### `/invitations/:token` — outside the tenant area

Not under `/tenant`: `requireTenant` (`features/tenant/server/tenant.server.ts:52-56`) throws 403
when the user has no membership, which is precisely the recipient's situation.

Three states must be explicit:
- **Not signed in** → `/auth/login` with `redirectTo`, then back.
- **Signed in as a different email than the invitation's** → say both addresses plainly and offer
  sign-out. Never silently accept as the current user.
- **Expired or revoked** → say so, and say to ask for a new invitation.

## Risks

1. **The 60-second cache.** The most likely defect in this feature is a missed `invalidate` call,
   and it fails silently.
2. **No new permission keys** means no seed run, avoiding the trap documented in `apps/api/CLAUDE.md`
   (a key added to the catalog but not seeded 403s its holders until the cache expires).
3. The new table must pass `check:rls` before CI is green.

## Verification

No tests (hard rule 1). Acceptance is the full static check in `AGENTS.md` — including
`check:theme-tokens` — followed by running the app:

1. Sign in as `owner@bookingstudio.vn` at `admin.bookingstudio.localhost:5174`.
2. Create a role "Lễ tân" holding only `tenant.bookings.read`.
3. Invite an email with no account; complete registration via Mailpit (`localhost:8025`).
4. Accept the invitation.
5. Confirm that user's sidebar shows **only** Đặt chỗ, and that `/tenant/finance` 403s.
6. Confirm the owner cannot remove their own roles, and cannot delete a role still in use.
