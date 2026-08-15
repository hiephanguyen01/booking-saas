# Partner Staff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a partner invite and manage its own team from the partner console, using the two pre-seeded partner roles.

**Architecture:** Reuses the tenant tier's invitation table, token port, accept route, email and dashboard components. Three things genuinely differ: the use-cases live in the **partner** module because it owns `partner_members`; the shared accept flow reaches partner membership through an **inverted port** so `identity-access` never touches another module's table; and every partner membership write must keep `partner_members` and `role_assignments` in **lockstep**, because the first is the notification recipient list.

**Spec:** `docs/superpowers/specs/2026-08-13-partner-staff-rbac-design.md` — read it before Task 1.

**Tech Stack:** NestJS 11 · Prisma (hand-written migrations) · Postgres 16 + RLS · Redis · React Router 8 SSR · zod contracts · shadcn/`@booking/ui`.

## Global Constraints

- **NO TESTS, EVER.** Hard rule 1 of `AGENTS.md`, enforced in CI by `pnpm check:no-tests`. Never create `*.spec.*` / `*.test.*`, vitest/jest/playwright config, or a `test` script. **This plan replaces the usual TDD cycle with the project's own gate: typecheck → lint → run the app.**
- **No service classes** in the application layer (hard rule 2). **One use-case = one file**, one exported `@Injectable XxxUseCase`, one public `execute()` (hard rule 3).
- **Every tenant write goes through `TenantDbService.forTenant(tenantId, tx => …)`** — one transaction per business operation, never nested. Repositories take `tx`.
- **Every protected route declares `@RequirePermissions(...)`**, `@Public()` or `@AuthenticatedOnly()`. Undeclared = 403. The decorator is **AND**, not OR.
- **`PermissionResolverService.invalidate(userId)` is called AFTER `forTenant` returns**, never inside — clearing the cache before the write is durable lets a concurrent request refill it with stale permissions. Omitting it is a silent 60-second authorization hole (`permission-resolver.service.ts:11`).
- **Do NOT add `@UseGuards(RequireActiveSubscriptionGuard)`.** Staff management is deliberately not subscription-gated, and importing that guard from `identity-access` closes a module cycle `check:module-cycles` rejects. `tenant-role.controller.ts` carries the full reasoning.
- **Migrations are hand-authored** (ADR 0004); never `prisma migrate dev`, never `prisma migrate reset` — the latter destroys the developer's seeded demo data.
- **Side effects cross module lines through the outbox**, never a direct call. The module import graph must stay acyclic.
- **Never fetch the backend from the browser.** Route URLs from `~/constants/paths`, backend endpoints from `~/constants/api-paths` — they spell nearly the same strings, so a swap compiles and silently talks to the wrong place.
- **Nothing non-serialisable on loader data** — no function, `Date`, `Map`, `Set` or class instance. React Router 8's turbo-stream encodes them as `SingleFetchFallback`, they arrive `undefined` after hydration, and `tsc`, `eslint` and `build` all stay green.
- **Semantic colour tokens only** in dashboard code; `check:theme-tokens` fails on a literal hex. UI copy is Vietnamese, hardcoded.
- **Dashboard commands need Node ≥ 22.22.0.** The shell defaults to v20.19.4 and React Router 8 refuses to run below the floor. Start every dashboard shell with `source ~/.nvm/nvm.sh && nvm use`. API-only tasks are unaffected.
- pnpm 10.13.1 only, never npm or yarn.

**Per-task cycle:** write the code → run the task's verification → commit. Messages: `feat(scope): …` / `fix(scope): …` / `docs: …`.

---

### Task 1: Contracts, and make the lockout policy tier-agnostic

**Files:**
- Modify: `packages/contracts/src/contracts/access.ts`
- Modify: `apps/api/src/modules/identity-access/domain/tenant-access-policy.ts`
- Modify: `apps/api/src/modules/identity-access/application/use-cases/set-tenant-member-roles.use-case.ts:66`
- Modify: `apps/api/src/modules/identity-access/application/use-cases/remove-tenant-member.use-case.ts:40`
- Modify: `apps/api/src/modules/identity-access/application/use-cases/update-tenant-role.use-case.ts:66`
- Modify: `apps/api/src/modules/identity-access/domain/permission-catalog.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `partnerPermissionKeySchema` / `PartnerPermissionKey`; `PartnerMember`; `InvitePartnerMemberInput` + schema; `SetPartnerMemberRolesInput` + schema; and `assertKeepsAManager(remaining, manageKey)` — the **two-argument** form every later task and the three existing tenant call sites use.

- [ ] **Step 1: Add the partner keys and shapes to contracts**

Append to `packages/contracts/src/contracts/access.ts`. Keep the existing tenant exports untouched.

```ts
/**
 * The partner half of the fixed permission catalog (§14.2). Same role as
 * `tenantPermissionKeySchema`: the single source the backend catalog and the
 * dashboard's Vietnamese label map both build from, so they cannot drift.
 */
export const partnerPermissionKeySchema = z.enum([
  'partner.profile.manage',
  'partner.listings.read',
  'partner.listings.write',
  'partner.listings.publish',
  'partner.bookings.read',
  'partner.bookings.write',
  'partner.bookings.approve',
  'partner.bookings.cancel',
  'partner.availability.manage',
  'partner.promotions.manage',
  'partner.finance.read',
  'partner.members.manage',
  'partner.roles.manage',
  'partner.reviews.read',
  'partner.reviews.reply',
  'partner.favorites.read',
  'partner.disputes.read',
  'partner.disputes.respond',
]);
export type PartnerPermissionKey = z.infer<typeof partnerPermissionKeySchema>;

export const partnerMemberSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(roleRefSchema),
  permissions: z.array(partnerPermissionKeySchema),
  joinedAt: z.string(),
});
export type PartnerMember = z.infer<typeof partnerMemberSchema>;

export const invitePartnerMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  roleIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một vai trò'),
});
export type InvitePartnerMemberInput = z.infer<typeof invitePartnerMemberInputSchema>;

export const setPartnerMemberRolesInputSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một vai trò'),
});
export type SetPartnerMemberRolesInput = z.infer<typeof setPartnerMemberRolesInputSchema>;
```

Then extend `tenantInvitationPreviewSchema` with one field so the accept screen can name the partner:

```ts
  /** Set when the invitation is into a partner rather than the tenant itself. */
  partnerName: z.string().nullable(),
```

- [ ] **Step 2: Build the catalog's partner block from the schema**

In `apps/api/src/modules/identity-access/domain/permission-catalog.ts`, replace the 18 hand-listed `// Partner` entries the same way the tenant block already works:

```ts
import { partnerPermissionKeySchema, tenantPermissionKeySchema, type ScopeLevel } from '@booking/contracts';

const PARTNER_KEYS = partnerPermissionKeySchema.options.map(
  (key): { key: string; scopeLevel: ScopeLevel } => ({ key, scopeLevel: 'partner' }),
);
```

and use `...PARTNER_KEYS` where the literals were. Leave the platform block and `SYSTEM_ROLES` alone.

- [ ] **Step 3: Make the lockout check take its key**

In `tenant-access-policy.ts`, replace the exported constant and the function:

```ts
/** The key whose disappearance locks a tenant out of its own staff management. */
export const TENANT_MEMBER_MANAGE_KEY = 'tenant.members.manage';
/** The partner-tier equivalent. */
export const PARTNER_MEMBER_MANAGE_KEY = 'partner.members.manage';

/**
 * `remaining` is the membership AS IT WOULD BE after the operation, and
 * `manageKey` is the permission whose disappearance strands that scope. The key
 * is a parameter rather than a constant because the same rule protects a tenant
 * from losing `tenant.members.manage` and a partner from losing
 * `partner.members.manage` — checked on effective permissions, never on role
 * names, since a custom role can carry either key and `Tenant Owner` is a name.
 */
export function assertKeepsAManager(
  remaining: ReadonlyArray<{ userId: string; permissions: readonly string[] }>,
  manageKey: string,
): void {
  const stillManaged = remaining.some((m) => m.permissions.includes(manageKey));
  if (!stillManaged) throw new LastManagerRemoved();
}
```

**Delete the old `MEMBER_MANAGE_KEY` export.** Do not keep it as an alias: a call site that still compiles against the one-argument form is exactly the regression to prevent, and removing the name makes the compiler find every one.

- [ ] **Step 4: Update the three existing tenant call sites**

Each gains a second argument. Nothing else about them changes:

```ts
// set-tenant-member-roles.use-case.ts:66 and update-tenant-role.use-case.ts:66
assertKeepsAManager(<existing projection expression>, TENANT_MEMBER_MANAGE_KEY);
// remove-tenant-member.use-case.ts:40
assertKeepsAManager(all.filter((m) => m.userId !== targetUserId), TENANT_MEMBER_MANAGE_KEY);
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/contracts build && pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

Expected: all succeed. A typecheck error at a call site you did not touch means a fourth caller exists — fix it rather than restoring the old export.

- [ ] **Step 6: Confirm the catalog did not change in content**

```bash
rg -c "key: '" apps/api/src/modules/identity-access/domain/permission-catalog.ts
```

Expected: **10** — the platform literals only, since tenant (24) and partner (18) are now generated. 10 + 24 + 18 = 52, the same total as before. Any other number means a key was lost or duplicated, which would need a seed run to reach the database — stop and report it.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/contracts/access.ts apps/api/src/modules/identity-access
git commit -m "feat(contracts): partner access schemas; lockout policy takes its manage key"
```

---

### Task 2: Migration — `partner_id` on invitations

**Files:**
- Create: `apps/api/prisma/migrations/20260814000000_partner_invitations/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (the `TenantInvitation` model, and the `Partner` back-relation)

**Interfaces:**
- Consumes: nothing.
- Produces: `TenantInvitation.partnerId String?` on the Prisma client.

- [ ] **Step 1: Write the migration**

```sql
-- apps/api/prisma/migrations/20260814000000_partner_invitations/migration.sql
ALTER TABLE "tenant_invitations"
  ADD COLUMN "partner_id" UUID,
  ADD CONSTRAINT "tenant_invitations_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "tenant_invitations_partner_id_status_idx"
  ON "tenant_invitations"("partner_id", "status");

-- One live invitation per address per scope. partner_id must be part of the key so a
-- person can hold a pending tenant invitation AND a pending invitation to a partner in
-- that tenant. NULLS NOT DISTINCT is load-bearing: without it two tenant-scope rows
-- (partner_id IS NULL) to the same address would stop colliding, silently removing the
-- duplicate-invite guard the tenant tier relies on.
DROP INDEX "tenant_invitations_pending_email_key";
CREATE UNIQUE INDEX "tenant_invitations_pending_email_key"
  ON "tenant_invitations"("tenant_id", "partner_id", "email")
  NULLS NOT DISTINCT
  WHERE "status" = 'pending';
```

> **Clause order:** `NULLS NOT DISTINCT` must precede `WHERE` in Postgres's `CREATE INDEX` grammar —
> `... NULLS NOT DISTINCT WHERE predicate`, not the reverse. Putting it after `WHERE` is a syntax
> error (`42601`) and the migration will fail to apply. Confirmed against Postgres 16.14 while
> executing this task on 2026-08-14; the one prior `NULLS NOT DISTINCT` index in this repo
> (`role_assignments_user_role_scope_key`) had no `WHERE` clause, so this ordering bug had nothing to
> catch it earlier. If you're copying this pattern for a future partial unique index, get the order
> right the first time.

No RLS change: the table already has `tenant_id`, its `tenant_isolation` policy and its grants. A partner-scoped row carries both ids and is covered unchanged.

- [ ] **Step 2: Update the Prisma model**

In `schema.prisma`'s `TenantInvitation`:

```prisma
  partnerId       String?                @map("partner_id") @db.Uuid
```

and add the relation plus its back-relation on `Partner`:

```prisma
  partner Partner? @relation(fields: [partnerId], references: [id], onDelete: Cascade)
```
```prisma
  // on model Partner
  invitations TenantInvitation[]
```

- [ ] **Step 3: Apply and regenerate**

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
```

If `prisma:deploy` reports drift, **stop and report BLOCKED with the exact error**. Do not run `prisma migrate reset` — it destroys the seeded demo tenants, partners, listings and bookings.

- [ ] **Step 4: Verify the index actually changed**

```bash
docker compose exec -T postgres psql -U postgres -d booking -c "\d tenant_invitations" | grep -A2 pending_email
```

Expected: the index is on `(tenant_id, partner_id, email)` with `NULLS NOT DISTINCT` and the `WHERE status = 'pending'` predicate. If it still shows two columns, the DROP/CREATE did not take.

```bash
pnpm --filter=@booking/api check:rls && pnpm --filter=@booking/api typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): tenant_invitations carries an optional partner scope"
```

---

### Task 3: The inverted port and the partner staff repository

This is where the lockstep invariant lives. Everything else in the plan depends on getting it right.

**Files:**
- Create: `apps/api/src/modules/identity-access/domain/ports/partner-membership-writer.port.ts`
- Create: `apps/api/src/modules/partner/domain/ports/partner-staff-repository.port.ts`
- Create: `apps/api/src/modules/partner/infrastructure/repositories/prisma-partner-staff.repository.ts`
- Modify: the partner Nest module — bind both symbols, and export the `PARTNER_MEMBERSHIP_WRITER` provider

**Interfaces:**
- Consumes: `PrismaTx` from `shared/tenant-context/tenant-db.service`.
- Produces:
  - `PARTNER_MEMBERSHIP_WRITER` + `IPartnerMembershipWriter.materialize(tx, params): Promise<string[]>` — returns the role ids actually assigned; an **empty array** means none of the invitation's roles survived.
  - `PARTNER_STAFF_REPOSITORY` + `IPartnerStaffRepository` with `list`, `findOne`, `filterAssignableRoles`, `addStaff`, `setRoles`, `removeStaff`.
  - `PartnerStaffRow` = `{ userId, fullName, email, avatarUrl, roles: {id,name}[], permissions: string[], joinedAt: Date }`.

- [ ] **Step 1: Declare the port in identity-access**

```ts
// apps/api/src/modules/identity-access/domain/ports/partner-membership-writer.port.ts
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PARTNER_MEMBERSHIP_WRITER = Symbol('PARTNER_MEMBERSHIP_WRITER');

/**
 * Lets the shared accept flow materialise a PARTNER membership without
 * identity-access ever touching `partner_members`, which the partner module
 * owns. The partner module implements this; the dependency runs partner →
 * identity-access, the direction that already exists for guards and decorators,
 * so no cycle is created.
 */
export interface IPartnerMembershipWriter {
  /**
   * Creates the `partner_members` row and the partner-scope role assignments
   * TOGETHER, inside the caller's transaction. Roles that no longer exist are
   * dropped; the return value is the ids actually assigned, and an empty array
   * means none survived — the caller decides what that means.
   */
  materialize(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] },
  ): Promise<string[]>;
}
```

- [ ] **Step 2: Declare the partner staff port**

```ts
// apps/api/src/modules/partner/domain/ports/partner-staff-repository.port.ts
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PARTNER_STAFF_REPOSITORY = Symbol('PARTNER_STAFF_REPOSITORY');

export interface PartnerStaffRow {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  roles: { id: string; name: string }[];
  permissions: string[];
  joinedAt: Date;
}

export interface PartnerRoleRow {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export interface IPartnerStaffRepository {
  /** Everyone holding a partner-scope assignment in this partner, grouped by user. */
  list(tx: PrismaTx, tenantId: string, partnerId: string): Promise<PartnerStaffRow[]>;
  findOne(tx: PrismaTx, tenantId: string, partnerId: string, userId: string): Promise<PartnerStaffRow | null>;
  /** Roles assignable in this partner: shared system partner roles plus this partner's own. */
  filterAssignableRoles(tx: PrismaTx, partnerId: string, roleIds: readonly string[]): Promise<PartnerRoleRow[]>;
  listAssignableRoles(tx: PrismaTx, partnerId: string): Promise<PartnerRoleRow[]>;
  /** LOCKSTEP: partner_members row + role assignments, together. Returns assigned role ids. */
  addStaff(tx: PrismaTx, params: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] }): Promise<string[]>;
  /** Replaces the role set only. Membership is untouched — the person stays on the team. */
  setRoles(tx: PrismaTx, params: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] }): Promise<void>;
  /** LOCKSTEP: deletes the partner_members row AND every partner-scope assignment. */
  removeStaff(tx: PrismaTx, tenantId: string, partnerId: string, userId: string): Promise<void>;
}
```

- [ ] **Step 3: Implement it, lockstep first**

Create `prisma-partner-staff.repository.ts`. The methods that carry the invariant must be written exactly:

```ts
async addStaff(tx, { tenantId, partnerId, userId, roleIds }): Promise<string[]> {
  // LOCKSTEP. `partner_members` is not a duplicate of `role_assignments` — it is the
  // notification recipient list (`prisma-notification.reader.ts:145,214`). A person with
  // assignments but no member row manages bookings and is never told a booking happened,
  // silently. Both rows are written here or neither is.
  const roles = await this.filterAssignableRoles(tx, partnerId, roleIds);
  if (roles.length === 0) return [];

  await tx.partnerMember.createMany({
    data: [{ tenantId, partnerId, userId }],
    skipDuplicates: true, // re-inviting an existing member must not fail on @@unique([partnerId, userId])
  });
  await tx.roleAssignment.createMany({
    data: roles.map((r) => ({ userId, roleId: r.id, tenantId, partnerId })),
    skipDuplicates: true,
  });
  return roles.map((r) => r.id);
}

async removeStaff(tx, tenantId, partnerId, userId): Promise<void> {
  // LOCKSTEP, the other direction. Leaving the member row behind would keep mailing
  // booking notifications to someone who can no longer act on them.
  await tx.roleAssignment.deleteMany({ where: { userId, tenantId, partnerId } });
  await tx.partnerMember.deleteMany({ where: { partnerId, userId } });
}
```

`filterAssignableRoles` and `listAssignableRoles` select partner-scope roles — the shared system ones and this partner's own:

```ts
const where = {
  scopeLevel: 'partner' as const,
  OR: [{ partnerId }, { partnerId: null, isSystem: true }],
};
```

`list()` groups `roleAssignment.findMany({ where: { tenantId, partnerId } })` by user and **unions** each user's role permission keys — the same shape `PrismaSessionInfoReader` produces, so the two never disagree. `joinedAt` comes from the `partner_members` row, not the assignment, because membership is what "joined" means here.

- [ ] **Step 4: Implement the writer adapter and bind both**

The adapter is a thin `@Injectable` implementing `IPartnerMembershipWriter` by delegating to `addStaff`. In the partner Nest module:

```ts
{ provide: PARTNER_STAFF_REPOSITORY, useClass: PrismaPartnerStaffRepository },
{ provide: PARTNER_MEMBERSHIP_WRITER, useClass: PartnerMembershipWriterAdapter },
```

and add `PARTNER_MEMBERSHIP_WRITER` to the module's `exports` so `identity-access` can inject it in Task 4.

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm check:module-cycles
```

`check:module-cycles` is the real gate here: if it fails, the port is being imported in the wrong direction. `identity-access` declares the interface; only the **partner** module may import the partner repository.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/identity-access/domain/ports apps/api/src/modules/partner
git commit -m "feat(api): partner staff repository with the lockstep membership invariant"
```

---

### Task 4: Branch the shared accept flow

**Files:**
- Modify: `apps/api/src/modules/identity-access/domain/ports/tenant-invitation-repository.port.ts` (add `partnerId` to `InvitationRow`)
- Modify: `apps/api/src/modules/identity-access/infrastructure/repositories/prisma-tenant-invitation.repository.ts`
- Modify: `apps/api/src/modules/identity-access/application/use-cases/accept-tenant-invitation.use-case.ts`
- Modify: `apps/api/src/modules/identity-access/application/use-cases/get-invitation-preview.use-case.ts`
- Modify: `apps/api/src/modules/identity-access/application/tenant-access.mapper.ts`
- Modify: the identity-access Nest module (import the partner module's exported writer)

**Interfaces:**
- Consumes: `PARTNER_MEMBERSHIP_WRITER` / `IPartnerMembershipWriter` from Task 3; `partnerName` on the preview contract from Task 1.
- Produces: an accept flow that handles both scopes, and a preview carrying `partnerName`.

- [ ] **Step 1: Carry the partner scope on the row and into writes**

Add `partnerId: string | null` and `partnerName: string | null` to `InvitationRow`, add `partnerId?: string` to `CreateInvitationData` (Task 5's invite use-case passes it), have `create()` persist it, and populate both read fields in **every** method that returns an `InvitationRow` — `list()` and `findByTokenHash()`. A method that selects the relation but never reads it into the row is the exact defect the tenant tier hit with `tenantName`; TypeScript will not catch it if you build the object field by field.

- [ ] **Step 2: Branch the accept**

In `accept-tenant-invitation.use-case.ts`, inject the writer and replace the role-resolution block inside `forTenant`. Everything before the transaction — the token lookup, the pending check, the case-insensitive email comparison — is unchanged and must stay unchanged.

```ts
await this.tenantDb.forTenant(row.tenantId, async (tx) => {
  const won = await this.invitations.markAccepted(tx, row.id, ctx.userId);
  if (!won) throw new InvitationNotPending(); // lost the CAS race

  let assigned: string[];
  if (row.partnerId) {
    // The partner module owns partner_members and writes it together with the
    // assignments; identity-access must never reach into that table itself.
    assigned = await this.partnerMembership.materialize(tx, {
      tenantId: row.tenantId,
      partnerId: row.partnerId,
      userId: ctx.userId,
      roleIds: row.roleIds,
    });
  } else {
    const roles = await this.roles.filterAssignable(tx, row.tenantId, row.roleIds);
    const existing = await this.members.findOne(tx, row.tenantId, ctx.userId);
    const held = new Set(existing?.roles.map((r) => r.id) ?? []);
    assigned = roles.map((r) => r.id).filter((id) => !held.has(id));
    if (assigned.length) await this.members.addRoles(tx, row.tenantId, ctx.userId, assigned);
  }
  if (assigned.length === 0 && !row.partnerId) throw new InvitationRolesGone();
  ...
});
```

**Read this carefully — the two scopes differ on what an empty result means.** For a tenant invitation, `assigned` is empty when the roles still exist but the person already holds them all, which is a legitimate no-op; `InvitationRolesGone` must only fire when `filterAssignable` itself returned nothing. Preserve the existing tenant behaviour exactly: compute `roles` first and throw `InvitationRolesGone` when `roles.length === 0`, before deduplicating against what the member already holds. For a partner invitation, `materialize` returns `[]` only when no role survived, so throw `InvitationRolesGone` on an empty return.

Write the final ordering so both statements are unambiguous, and put the audit write and the `entityType` in the same place it is today. The `invalidate(userId)` call stays **after** `forTenant` returns.

- [ ] **Step 3: Carry the partner name into the preview**

`toTenantInvitationPreview` gains `partnerName: row.partnerName`. The preview must still **not** throw on an email mismatch — it returns `matchesCurrentUser: false` so the Task 7 screen can explain the situation.

- [ ] **Step 4: Wire the module**

The identity-access module imports the partner module (which exports `PARTNER_MEMBERSHIP_WRITER`). If that import creates a cycle — partner already imports identity-access — use `forwardRef` on both sides, which NestJS supports for exactly this, and say so in your report. If `pnpm check:module-cycles` rejects it regardless, **stop and report BLOCKED**: the static guard and the runtime DI disagree, and that is a design question, not something to work around.

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm check:module-cycles
```

Then, with the API running, confirm a **tenant** invitation still accepts end to end exactly as before — this task edits shipped, working code, and a regression here breaks the tier already in production.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/identity-access
git commit -m "feat(api): accept flow materialises tenant or partner membership"
```

---

### Task 5: Partner member endpoints

**Files:**
- Create: `apps/api/src/modules/partner/application/use-cases/list-partner-members.use-case.ts`
- Create: `.../list-partner-invitations.use-case.ts`
- Create: `.../invite-partner-member.use-case.ts`
- Create: `.../revoke-partner-invitation.use-case.ts`
- Create: `.../set-partner-member-roles.use-case.ts`
- Create: `.../remove-partner-member.use-case.ts`
- Create: `.../list-assignable-partner-roles.use-case.ts`
- Create: `apps/api/src/modules/partner/application/partner-staff.mapper.ts`
- Create: `apps/api/src/modules/partner/infrastructure/http/dto/partner-staff.dto.ts`
- Create: `apps/api/src/modules/partner/infrastructure/http/partner-member.controller.ts`
- Modify: the partner Nest module

**Interfaces:**
- Consumes: Task 1 contracts and `assertKeepsAManager(remaining, manageKey)`; Task 3's `IPartnerStaffRepository`; the shipped `ITenantInvitationRepository`, `IInvitationToken`, `IAuditWriter`, `IPermissionResolver`, `OutboxService`.
- Produces: the seven routes in the spec's table.

- [ ] **Step 1: Write `invite-partner-member.use-case.ts`**

```ts
async execute(
  scope: { tenantId: string; partnerId: string },
  input: InvitePartnerMemberInput,
  ctx: { userId: string },
): Promise<void> {
  const callerHolds = await this.resolver.resolve(ctx.userId, scope);
  const { token, tokenHash } = this.tokens.issue();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await this.tenantDb.forTenant(scope.tenantId, async (tx) => {
    const roles = await this.staff.filterAssignableRoles(tx, scope.partnerId, input.roleIds);
    if (roles.length !== input.roleIds.length) throw new RoleNotFound();
    assertGrantable(roles.flatMap((r) => r.permissions), callerHolds);

    const invitationId = await this.invitations.create(tx, {
      tenantId: scope.tenantId,
      partnerId: scope.partnerId,
      email: input.email,
      roleIds: input.roleIds,
      tokenHash,
      invitedByUserId: ctx.userId,
      expiresAt,
    });

    await this.outbox.emit(tx, {
      tenantId: scope.tenantId,
      eventType: 'tenant.member_invited',
      payload: {
        invitationId,
        email: input.email,
        token,
        roleNames: roles.map((r) => r.name),
        partnerId: scope.partnerId,
      },
    });

    await this.audit.write(tx, {
      tenantId: scope.tenantId,
      actorUserId: ctx.userId,
      action: 'partner_member.invited',
      entityType: 'tenant_invitation',
      entityId: invitationId,
      data: { email: input.email, roleIds: input.roleIds, partnerId: scope.partnerId },
    });
  });
}
```

`CreateInvitationData` gains `partnerId?: string`; the repository writes it. The event type stays `tenant.member_invited` — the payload's `partnerId` is what tells Task 6 which sentence to render.

- [ ] **Step 2: Write `set-partner-member-roles.use-case.ts` and `remove-partner-member.use-case.ts`**

Both carry the invariants. Mirror the shipped tenant equivalents, with two differences: the manage key, and the lockstep on removal.

```ts
// set-partner-member-roles
assertNotSelf(ctx.userId, targetUserId);
const callerHolds = await this.resolver.resolve(ctx.userId, scope);
await this.tenantDb.forTenant(scope.tenantId, async (tx) => {
  const member = await this.staff.findOne(tx, scope.tenantId, scope.partnerId, targetUserId);
  if (!member) throw new MemberNotFound();
  const roles = await this.staff.filterAssignableRoles(tx, scope.partnerId, input.roleIds);
  if (roles.length !== input.roleIds.length) throw new RoleNotFound();
  assertGrantable(roles.flatMap((r) => r.permissions), callerHolds);

  const nextPermissions = [...new Set(roles.flatMap((r) => r.permissions))];
  const all = await this.staff.list(tx, scope.tenantId, scope.partnerId);
  assertKeepsAManager(
    all.map((m) => (m.userId === targetUserId ? { userId: m.userId, permissions: nextPermissions } : m)),
    PARTNER_MEMBER_MANAGE_KEY,
  );

  await this.staff.setRoles(tx, { ...scope, userId: targetUserId, roleIds: input.roleIds });
  await this.audit.write(tx, {
    tenantId: scope.tenantId,
    actorUserId: ctx.userId,
    action: 'partner_member.roles_changed',
    entityType: 'user',
    entityId: targetUserId,
    data: { partnerId: scope.partnerId, roleIds: input.roleIds },
  });
});
await this.resolver.invalidate(targetUserId);
```

```ts
// remove-partner-member
assertNotSelf(ctx.userId, targetUserId);
await this.tenantDb.forTenant(scope.tenantId, async (tx) => {
  const all = await this.staff.list(tx, scope.tenantId, scope.partnerId);
  assertKeepsAManager(all.filter((m) => m.userId !== targetUserId), PARTNER_MEMBER_MANAGE_KEY);
  await this.staff.removeStaff(tx, scope.tenantId, scope.partnerId, targetUserId);
  await this.audit.write(tx, {
    tenantId: scope.tenantId,
    actorUserId: ctx.userId,
    action: 'partner_member.removed',
    entityType: 'user',
    entityId: targetUserId,
    data: { partnerId: scope.partnerId },
  });
});
await this.resolver.invalidate(targetUserId);
```

- [ ] **Step 3: Write the four read/revoke use-cases, the mapper and the DTOs**

`ListPartnerInvitationsUseCase` filters the shared repository's rows to this partner:
`(await this.invitations.list(tx, tenantId)).filter((r) => r.partnerId === partnerId)`.

`RevokeTenantInvitationUseCase` from the tenant tier **cannot** be reused: it scopes by tenant only, so a partner owner could revoke a tenant-scope invitation — or another partner's — by guessing an id. Write `RevokePartnerInvitationUseCase` with the ownership check before the write:

```ts
await this.tenantDb.forTenant(scope.tenantId, async (tx) => {
  const rows = await this.invitations.list(tx, scope.tenantId);
  const row = rows.find((r) => r.id === invitationId);
  // Scope check BEFORE the revoke: `invitations` is one shared table across both
  // tiers, so an id alone proves nothing about who may act on it.
  if (!row || row.partnerId !== scope.partnerId) throw new InvitationNotFound();

  const revoked = await this.invitations.revoke(tx, scope.tenantId, invitationId);
  if (!revoked) throw new InvitationNotPending();

  await this.audit.write(tx, {
    tenantId: scope.tenantId,
    actorUserId: ctx.userId,
    action: 'partner_member.invitation_revoked',
    entityType: 'tenant_invitation',
    entityId: invitationId,
    data: { partnerId: scope.partnerId },
  });
});
```

The mapper lists contract fields explicitly; never spread a repository row into a response.

- [ ] **Step 4: Write the controller**

```ts
@ApiTags('partner: members')
@Controller('partner/members')
export class PartnerMemberController {
  // No RequireActiveSubscriptionGuard — same reasoning as tenant-role.controller.ts:
  // staff management stays available when billing lapses so access can still be
  // revoked, and importing that guard here closes a module cycle.
```

Every route declares `@RequirePermissions('partner.members.manage')`. The scope comes from `TenantContextService` — the guard has already verified the caller holds an assignment in the partner named by `x-partner-id` and seeded both ids.

Declare `/partner/members/invitations` **before** any `/partner/members/:userId` route, or the literal segment is captured as a `userId` and every invitation call 404s. Put `/partner/roles/assignable` in this controller too, or a second one — one class per file either way.

- [ ] **Step 5: Verify by calling it**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm check:module-cycles
```

With the API running, sign in as the seeded partner owner `giang@giangstudio.vn` / `demo-password` and confirm by hand: `GET /partner/members` lists that owner; removing yourself returns 409 `CANNOT_EDIT_SELF`; removing the only holder of `partner.members.manage` returns 409 `LAST_MANAGER_REMOVED`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/partner
git commit -m "feat(api): partner member endpoints with lockout and lockstep guards"
```

---

### Task 6: The partner variant of the invitation email

**Files:**
- Modify: `apps/api/src/modules/notification/application/use-cases/dispatch-member-invitation-event.use-case.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/email/react-email.renderer.tsx` (copy only)

**Interfaces:**
- Consumes: the `partnerId` field Task 5 adds to the outbox payload.
- Produces: an invitation mail that names the partner when the invitation is partner-scoped.

- [ ] **Step 1: Resolve the partner name inside the notification module**

Do **not** import anything from `partner` or `identity-access`. `INotificationReader` already resolves partner-scoped context from a bare id — `loadPartnerContext(tx, partnerId)` (`prisma-notification.reader.ts:218`) returns the partner name alongside the tenant's. Use it when the payload carries a `partnerId`, and keep the existing `loadBrand(tenantId)` path when it does not.

- [ ] **Step 2: Add the partner sentence**

Keep the single template id `tenant_member_invited`. Add an optional `partnerName` to its `TemplateData` and one alternative line in both `vi` and `en` copy — e.g. Vietnamese `{tenantName} mời bạn tham gia quản trị đối tác {partnerName}` — selected when `partnerName` is present. The CTA URL logic is unchanged: it still points at the tenant's primary verified dashboard host.

- [ ] **Step 3: Verify in Mailpit**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm check:module-cycles
```

Send a partner invitation through the API, open `localhost:8025`, and **paste the actual subject and href into your report**. Then send a tenant invitation and confirm its copy is unchanged — this file is shared with the shipped tier.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/notification
git commit -m "feat(api): invitation email names the partner when the invite is partner-scoped"
```

---

### Task 7: Dashboard — partner members screen and forms

**Files:**
- Modify: `apps/dashboard/app/constants/api-paths.ts` (a `partner` section)
- Modify: `apps/dashboard/app/constants/paths.ts` (partner entries)
- Modify: `apps/dashboard/app/constants/permissions.ts` (partner labels + groups)
- Create: `apps/dashboard/app/features/partner/server/members-loader.server.ts`
- Create: `apps/dashboard/app/features/partner/server/members-actions.server.ts`
- Create: `apps/dashboard/app/routes/partner/members/_index.tsx`
- Create: `apps/dashboard/app/routes/partner/members/invite.tsx`
- Create: `apps/dashboard/app/routes/partner/members/detail.tsx`
- Modify: `apps/dashboard/app/routes/partner/routes.ts`, `apps/dashboard/app/routes/partner/nav.ts`
- Modify: `apps/dashboard/app/routes/invitations/accept.tsx` (name the partner)

**Interfaces:**
- Consumes: Task 1 contracts; Task 5's endpoints; the shipped `MemberForm`, `RoleMultiSelect`, `PermissionPreview`, `MembersTable`, `InvitationsTable` under `features/tenant/components/members/`.
- Produces: `/partner/members` with two tabs, plus the two form routes.

- [ ] **Step 1: Add the paths and the Vietnamese labels**

`apiPaths.partner.members`, `.member(userId)`, `.memberRoles(userId)`, `.invitations`, `.invitation(id)`, `.rolesAssignable`; `dashboardPaths.partner.members`, `.membersSection(section)`, `.memberInvite`, `.member(userId)`.

`PARTNER_PERMISSION_LABELS: Record<PartnerPermissionKey, string>` — the strict `Record` is deliberate, so a key added to the contracts enum later fails typecheck here until someone writes its label. Add `PARTNER_PERMISSION_GROUPS` covering **all 18** keys; a key missing from every group vanishes from the permission preview and the operator never learns it exists.

- [ ] **Step 2: Write the loader and actions**

`loadPartnerMembers(request)` calls `requirePartner(request, 'partner.members.manage')` and returns `{ members, invitations, roles, currentUserId }` — **plain JSON and strings only**. `currentUserId` is needed so the table can hide the self-edit actions that the server would refuse; the tenant tier shipped that bug and had to fix it.

`handlePartnerMembersAction({ request })` switches on `intent`: `invite`, `revoke-invitation`, `set-roles`, `remove-member`. Map backend error codes to Vietnamese the way the tenant tier's `domainErrorMessage` does — reuse that helper if it is exported, and if it is not, move it somewhere both can import rather than writing a second copy.

- [ ] **Step 3: The screen and the two forms**

`/partner/members` renders two tabs from `useSearchParams()`: Thành viên and Lời mời. There is no Vai trò tab in this tier.

Reuse `MembersTable` and `InvitationsTable` as they stand. Reuse `MemberForm` with `mode="invite" | "edit"`, passing `canCreateRole={false}` so the inline role creator never renders — this tier surfaces no role-management permission.

If any of those components turns out to be welded to tenant-specific types or paths, **extract the shared part rather than copying the component**, and say in your report exactly what you moved.

- [ ] **Step 4: Nav and the accept screen**

Add one nav item to `routes/partner/nav.ts`, in the section where "Hồ sơ" sits, gated on `permission: 'partner.members.manage'` — a single key, not `anyPermissions`, because there is no second tab permission. Use the `UsersRound` icon.

In `routes/invitations/accept.tsx`, when the preview carries a `partnerName`, name the partner as well as the tenant so the recipient knows which team they are joining. Every other state on that screen is unchanged.

- [ ] **Step 5: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use
pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint
pnpm check:frontend-structure && pnpm check:theme-tokens
```

Then run the app and look at it: sign in at `admin.studiohub.localhost:5174` as `giang@giangstudio.vn` / `demo-password`, confirm "Nhân sự" appears, both tabs render, and the owner's own row does **not** offer actions that would be refused.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app
git commit -m "feat(dashboard): partner members screen and forms"
```

---

### Task 8: Verification and docs

**Files:**
- Modify: `tasks/phase-2-marketplace-depth/03-role-builder-ui.md`
- Modify: `apps/api/CLAUDE.md` (one line on the inverted membership port, under Inter-module communication)

- [ ] **Step 1: Full static check**

```bash
source ~/.nvm/nvm.sh && nvm use
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Run the whole line, not a subset. Paste the real output.

- [ ] **Step 2: Walk the scenario**

Sign in at `admin.studiohub.localhost:5174` as `giang@giangstudio.vn` / `demo-password`.

1. Invite an address with no account to that partner with the `Staff` role.
2. Register through the OTP flow (Mailpit at `localhost:8025`; copy the token and open `http://admin.studiohub.localhost:5174/invitations/<token>` directly, since the CTA points at the staging primary host which does not resolve locally).
3. Accept, and confirm the member appears in `/partner/members` with the screens `Staff` permits and no more.
4. **Check the lockstep rule directly in the database** — the point of this feature's riskiest invariant:

```sql
SELECT (SELECT count(*) FROM partner_members WHERE user_id = '<id>') AS members,
       (SELECT count(*) FROM role_assignments WHERE user_id = '<id>' AND partner_id IS NOT NULL) AS assignments;
```

Expected: both non-zero. Then remove the member through the UI and re-run: both zero. A member row surviving removal keeps mailing booking notifications to someone who can no longer act on them, and nothing in the UI would show it.

5. Confirm the two refusals: removing your own roles, and removing the last holder of `partner.members.manage`.
6. **Confirm the tenant tier still works** — its members screen, an invite, and its lockout refusal. Tasks 1 and 4 edited shipped code that tier depends on.

Clean up everything you create and say so.

- [ ] **Step 3: Docs**

Tick the partner-tier boxes in `tasks/phase-2-marketplace-depth/03-role-builder-ui.md` and note that only the platform tier remains. Add one line to `apps/api/CLAUDE.md` recording the inverted-port pattern: when a module must write another module's table inside one transaction, the owner declares nothing — the *caller's* module declares a port and the owner implements it, keeping the import direction that already exists.

- [ ] **Step 4: Commit**

```bash
git add tasks apps/api/CLAUDE.md
git commit -m "docs: partner tier of the role-builder ticket is done"
```

---

## Notes for the implementer

**The lockstep invariant is this feature's defining risk.** Its failure mode is silent: a staff member who works normally in the UI and never receives a booking email. No static check can see it, and neither can a screenshot. The only proof is querying both tables, which is why Task 8 does exactly that.

**Tasks 1 and 4 edit code the tenant tier depends on** — the lockout policy and the accept flow, both shipped and both protecting invariants that stop a tenant locking itself out. Re-exercise the tenant path after touching either.
