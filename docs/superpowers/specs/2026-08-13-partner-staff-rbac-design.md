# Partner Staff (RBAC write path, partner tier)

## Goal

Let a partner run its own team: invite people, give them one of the two pre-seeded partner roles,
change or revoke those roles — from the partner console, without a tenant operator or a DBA
intervening.

This is the partner half of `tasks/phase-2-marketplace-depth/03-role-builder-ui.md`. The tenant half
shipped in PR #93 (`docs/superpowers/specs/2026-08-13-tenant-staff-rbac-design.md`); this design
reuses its machinery wherever the two tiers genuinely agree and diverges only where partner is
actually different.

Today the only way a partner gains a second member is a hand-written SQL insert. `approve-partner`
creates the owner's `partner_members` row and `Partner Owner` role assignment
(`prisma-partner.repository.ts:294-315`) and nothing else ever writes either table.

## Scope

**In:** `tenant_invitations` gains a nullable `partner_id`; partner member endpoints in the
**partner** module; a `IPartnerMembershipWriter` port so the shared accept flow never touches
`partner_members`; a two-tab `/partner/members` screen with invite and edit-member forms reusing the
tenant tier's components; a partner variant of the invitation email.

**Out:** a **role builder for partners** — they use the two pre-seeded system roles; the platform
tier; an audit-log viewer (entries are written); a tenant operator managing a partner's staff; new
permission keys, so **no seed run is required**.

## Decisions

| Question | Decision |
| --- | --- |
| `partner_members` vs `role_assignments` | **Lockstep.** Both rows are created together and deleted together, in one transaction, from one place. See below — this is the invariant most likely to be broken. |
| One invitation table or two | **One.** `tenant_invitations` gains `partner_id uuid NULL`. A second table would duplicate the table, its RLS policy, the accept screen and the email for no behavioural gain. |
| Where the code lives | The **partner** module, not `identity-access`. Partner owns `PartnerMember`, and `prisma-partner.repository.ts` already writes both tables — no new pattern is introduced. |
| How the shared accept flow writes a partner membership | `identity-access` declares `IPartnerMembershipWriter`; the partner module implements it. Dependency inverted, so `identity-access` never reaches into `partner_members`. |
| Custom partner roles | **Not built.** A partner is a small operator — a studio, a pitch operator — typically 2–5 people. `Partner Owner` (all 18 partner keys) and `Staff` (6 keys) cover them. |
| Who may invite | Whoever holds `partner.members.manage` **in that partner's scope**. A tenant-scope operator cannot, by construction: the guard resolves permissions for the scope named by `x-partner-id` and verifies the caller holds an assignment there. |

## The lockstep invariant

`partner_members` is not a duplicate of `role_assignments`. It is the **notification recipient
list**: `prisma-notification.reader.ts:145,214` reads it to decide who is told about a booking.

So the two tables answer different questions — "who is told" and "who may act" — and a partner staff
member must be both. A member row without an assignment can receive booking mail and cannot sign in;
an assignment without a member row is worse, because that person manages bookings and is **never
told a booking happened** — silently, with no error and no log line.

Therefore:

- Accepting a partner invitation writes **both** rows inside one `forTenant` transaction.
- Removing a partner member deletes **both**.
- Exactly one component writes both: `PrismaPartnerRepository`, which already owns `addMember` and
  `assignRole`. No other code path may create one without the other.

## Data Model

No new table. `tenant_invitations` changes:

```
+ partner_id  uuid NULL  REFERENCES partners(id) ON DELETE CASCADE
```

and the partial unique index widens:

```
tenant_invitations_pending_email_key  (tenant_id, email)              WHERE status = 'pending'
→                                     (tenant_id, partner_id, email)  WHERE status = 'pending'
                                      NULLS NOT DISTINCT
```

`NULLS NOT DISTINCT` is load-bearing. Without it two tenant-scope invitations (`partner_id IS NULL`)
to the same address would stop colliding, silently removing the duplicate-invite guard the tenant
tier relies on. With it, a person can still hold one pending tenant invitation *and* one pending
invitation to a partner in that tenant — different things, both legitimate.

The table keeps its existing `tenant_id`, RLS policy and grants; a partner-scoped row carries both
ids, so `tenant_isolation` continues to apply unchanged.

## Backend

### Module placement and the inverted dependency

Partner member use-cases live in `apps/api/src/modules/partner/`. The shared accept flow stays in
`identity-access`, which must not touch `partner_members`.

`identity-access` therefore declares a port:

```ts
export const PARTNER_MEMBERSHIP_WRITER = Symbol('PARTNER_MEMBERSHIP_WRITER');

export interface IPartnerMembershipWriter {
  /** Creates the partner_members row and the partner-scope role assignments together. */
  materialize(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] },
  ): Promise<void>;
}
```

The partner module binds the adapter. Partner already imports `identity-access` for guards and
decorators, so this closes no cycle — `pnpm check:module-cycles` is the gate.

`AcceptTenantInvitationUseCase` branches on the invitation's `partnerId`: null means assign roles as
today; non-null delegates to the port.

### Endpoints

`partner-member.controller.ts` in the partner module. All declare `partner.members.manage`.

| Method | Path |
| --- | --- |
| GET | `/partner/members` |
| GET | `/partner/members/invitations` |
| POST | `/partner/members/invitations` |
| DELETE | `/partner/members/invitations/:id` |
| PUT | `/partner/members/:userId/roles` |
| DELETE | `/partner/members/:userId` |
| GET | `/partner/roles/assignable` |

There is no role CRUD in this tier.

`/partner/roles/assignable` returns the roles assignable in this partner's scope, which today are
exactly the two pre-seeded system ones; it is a query, not a hard-coded pair, so a partner-scope role
created outside the UI still appears.

Reused unchanged: `GET|POST /auth/invitations/:token[/accept]`, the token port and its SHA-256
adapter, and the audit writer. The outbox **event type stays `tenant.member_invited`** — a partner
invitation is still an invitation into a tenant's system, and a second event type would need a second
handler registration for no gain. The payload carries the `partnerId` and partner name, and the
notification handler selects partner-flavoured copy when they are present. The template id stays one;
only the rendered sentence differs.

### Safety invariants

The tenant tier's rules apply, re-pointed at partner scope:

1. **No lockout** — reject any operation leaving the partner with nobody holding
   `partner.members.manage`, evaluated on effective permissions, not role names.
2. **No self-edit** — a user cannot change or remove their own roles.
3. **No escalation** — a caller may only grant permissions they hold, rejected with the offending
   keys rather than silently trimmed.
4. **`PermissionResolverService.invalidate(userId)` after the transaction commits**, never inside.
5. **Audit through `IAuditWriter`** in the same transaction: `partner_member.invited`,
   `partner_member.roles_changed`, `partner_member.removed`.
6. **Lockstep** — both rows or neither, per the section above.

### One shared-code change

`assertKeepsAManager` currently hard-codes `MEMBER_MANAGE_KEY = 'tenant.members.manage'`
(`tenant-access-policy.ts`). It must take the key as a parameter so the same policy serves both
tiers. This is reviewed, shipped domain code that the tenant tier depends on: change the signature,
update the three existing tenant call sites, and change nothing else about its behaviour.

## Frontend

One nav item, **"Nhân sự"**, in `routes/partner/nav.ts`, gated on `partner.members.manage` — a single
permission, not `anyPermissions`, because this tier has no roles tab.

`/partner/members` has **two** tabs: Thành viên and Lời mời. No Vai trò tab.

The forms reuse the tenant tier's components as they stand: `MemberForm` with `mode`,
`RoleMultiSelect`, `PermissionPreview`, and the Vietnamese permission-label map extended with the 18
partner keys. The inline "Tạo vai trò mới" panel is not rendered — it is already conditional on a
role-management permission this tier does not surface.

`/invitations/:token` already exists and needs one addition: when the invitation carries a
`partnerId`, the screen names the partner as well as the tenant, so the recipient knows which team
they are joining.

## Risks

1. **The lockstep invariant is the likely defect.** Its failure mode is silent — a staff member who
   never receives booking mail — and no static check can see it.
2. `assertKeepsAManager` is shared with the shipped tenant tier; a mistake in the signature change
   regresses tenant lockout protection, which is the invariant that stops a tenant locking itself
   out of its own console.
3. The `partner_id` column now carries two meanings on one table (tenant-scope invitation when null,
   partner-scope when set). The widened partial index is what keeps both honest.

## Verification

No tests (hard rule 1, ADR 0005). The full static check from `AGENTS.md`, then the app:

1. Sign in at `admin.bookingstudio.localhost:5174` as `giang@giangstudio.vn` / `demo-password`
   (the seeded BookingStudio partner).
2. Invite an address with no account to that partner with the `Staff` role.
3. Register through the OTP flow, accept the invitation.
4. Confirm the new member appears in `/partner/members` and that their sidebar shows only the
   screens `Staff` permits.
5. **Check the lockstep rule directly**: query both tables and confirm the accept produced a
   `partner_members` row *and* the `role_assignments` row. This is the step that catches the silent
   failure — a member missing from `partner_members` looks completely normal in the UI and only
   reveals itself later as booking mail that never arrives. Then remove the member and confirm both
   rows are gone.
6. Confirm the two refusals: removing your own roles, and removing the last holder of
   `partner.members.manage`.
7. Confirm the tenant tier still works: its own members screen, and its lockout refusal.
