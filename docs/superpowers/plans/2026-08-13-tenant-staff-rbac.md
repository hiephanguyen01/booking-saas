# Tenant Staff & Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a tenant a working write path for RBAC — invite people, assign multiple roles, define custom roles — on top of the Phase 0 foundation, without touching the permission resolver or the session-info reader.

**Architecture:** A tenant staff member *is* a `role_assignments` row (`tenant_id` set, `partner_id` null); no staff entity is introduced. One new table, `tenant_invitations`, carries a pending invite. All endpoints live in `identity-access`, follow `controller → use-case → repository-port → repository`, and every business invariant lives in one framework-free policy module so the rules are readable in a single file. The dashboard gets one nav item, a three-tab screen, and four full-page forms.

**Spec:** `docs/superpowers/specs/2026-08-13-tenant-staff-rbac-design.md` — read it before Task 1.

**Tech Stack:** NestJS 11 · Prisma (hand-written migrations) · Postgres 16 + RLS · Redis · React Router 8 SSR · zod contracts · shadcn/`@booking/ui`.

## Global Constraints

- **NO TESTS, EVER.** Hard rule 1 of `AGENTS.md`. Never create `*.spec.*` / `*.test.*`, vitest/jest/playwright config, or a `test` script. **This plan therefore replaces the usual TDD cycle with the project's own gate: typecheck → lint → run the app.** If you feel the urge to add a test, don't; add a verification step to the task instead.
- **No service classes** in the application layer (hard rule 2). Pure logic → a function in `domain/`; reusable orchestration → a use-case; technical capability → port + adapter.
- **One use-case = one file** — exactly one exported `@Injectable XxxUseCase` with a single public `execute()` (hard rule 3).
- **Every tenant write goes through `TenantDbService.forTenant(tenantId, tx => …)`** — one interactive transaction per business operation. Never nest it, never call it per query. Repositories take `tx`, never the raw client.
- **Every protected route declares `@RequirePermissions('scope.resource.action')`**, `@Public()`, or `@AuthenticatedOnly()`. Undeclared = 403. `@RequirePermissions` is **AND**, not OR (`permissions.guard.ts:47`).
- **Migrations are hand-authored**, never `prisma migrate dev` (ADR 0004). Every tenant-scoped table needs `tenant_id uuid NOT NULL`, FORCE RLS, a `tenant_isolation` policy, and grants to `app_user, app_admin`.
- **Cross-module side effects go through the outbox**, never a direct call (ADR 0003).
- **Dashboard UI is Vietnamese-hardcoded.** No i18n keys; write the Vietnamese copy directly.
- **Route URLs come from `~/constants/paths`; backend endpoints from `~/constants/api-paths`.** Never string-build either; never append a query string — pass `{ query }`.
- **Semantic colour tokens only** in dashboard code — a literal hex is a defect, and `check:theme-tokens` fails on it.
- Node ≥ 22.22.0 (`nvm use`), pnpm 10.13.1. Never npm/yarn.

**Per-task cycle** (there is no test cycle): write the code → run the task's verification command → commit. Commit messages: `feat(scope): …` / `fix(scope): …` / `docs: …`.

---

### Task 1: Contracts — tenant permission keys and access schemas

**Files:**
- Create: `packages/contracts/src/contracts/access.ts`
- Modify: `packages/contracts/src/index.ts` (add the export line beside the other `./contracts/*` exports)
- Modify: `apps/api/src/modules/identity-access/domain/permission-catalog.ts:21-45`

**Interfaces:**
- Consumes: nothing.
- Produces: `tenantPermissionKeySchema` / `TenantPermissionKey`; `TenantRoleSummary`, `TenantRoleDetail`, `CreateTenantRoleInput`, `UpdateTenantRoleInput`, `TenantMember`, `SetTenantMemberRolesInput`, `TenantInvitation`, `InviteTenantMemberInput`, `TenantInvitationPreview`, `TenantInvitationStatus`. Every later task imports these from `@booking/contracts`.

- [ ] **Step 1: Write the contract module**

```ts
// packages/contracts/src/contracts/access.ts
import { z } from 'zod';

/**
 * The tenant half of the fixed permission catalog (§14.2). This schema is the
 * SINGLE source of the tenant keys: `permission-catalog.ts` builds its tenant
 * section from it, so the backend catalog and the dashboard's label map cannot
 * drift apart.
 */
export const tenantPermissionKeySchema = z.enum([
  'tenant.settings.manage',
  'tenant.legal.manage',
  'tenant.theme.manage',
  'tenant.partners.read',
  'tenant.partners.manage',
  'tenant.partners.approve',
  'tenant.listings.read',
  'tenant.listings.write',
  'tenant.listings.publish',
  'tenant.bookings.read',
  'tenant.bookings.manage',
  'tenant.bookings.cancel',
  'tenant.commissions.manage',
  'tenant.promotions.manage',
  'tenant.finance.read',
  'tenant.payouts.manage',
  'tenant.affiliates.manage',
  'tenant.members.manage',
  'tenant.roles.manage',
  'tenant.reports.read',
  'tenant.reviews.read',
  'tenant.favorites.read',
  'tenant.disputes.read',
  'tenant.disputes.resolve',
]);
export type TenantPermissionKey = z.infer<typeof tenantPermissionKeySchema>;

export const roleRefSchema = z.object({ id: z.string().uuid(), name: z.string() });
export type RoleRef = z.infer<typeof roleRefSchema>;

export const tenantRoleSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isSystem: z.boolean(),
  memberCount: z.number().int().nonnegative(),
});
export type TenantRoleSummary = z.infer<typeof tenantRoleSummarySchema>;

export const tenantRoleDetailSchema = tenantRoleSummarySchema.extend({
  permissions: z.array(tenantPermissionKeySchema),
});
export type TenantRoleDetail = z.infer<typeof tenantRoleDetailSchema>;

export const createTenantRoleInputSchema = z.object({
  name: z.string().trim().min(2, 'Tên vai trò quá ngắn').max(60, 'Tên vai trò quá dài'),
  permissions: z.array(tenantPermissionKeySchema).min(1, 'Chọn ít nhất một quyền'),
});
export type CreateTenantRoleInput = z.infer<typeof createTenantRoleInputSchema>;

export const updateTenantRoleInputSchema = createTenantRoleInputSchema;
export type UpdateTenantRoleInput = z.infer<typeof updateTenantRoleInputSchema>;

export const tenantMemberSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(roleRefSchema),
  /** Union of every assigned role's keys — what the person can actually do. */
  permissions: z.array(tenantPermissionKeySchema),
  joinedAt: z.string(),
});
export type TenantMember = z.infer<typeof tenantMemberSchema>;

export const setTenantMemberRolesInputSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một vai trò'),
});
export type SetTenantMemberRolesInput = z.infer<typeof setTenantMemberRolesInputSchema>;

export const tenantInvitationStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);
export type TenantInvitationStatus = z.infer<typeof tenantInvitationStatusSchema>;

export const tenantInvitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  roles: z.array(roleRefSchema),
  status: tenantInvitationStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
  invitedByName: z.string().nullable(),
});
export type TenantInvitation = z.infer<typeof tenantInvitationSchema>;

export const inviteTenantMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  roleIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một vai trò'),
});
export type InviteTenantMemberInput = z.infer<typeof inviteTenantMemberInputSchema>;

export const tenantInvitationPreviewSchema = z.object({
  tenantName: z.string(),
  invitedEmail: z.string(),
  roles: z.array(roleRefSchema),
  status: tenantInvitationStatusSchema,
  /** False when the signed-in account is not the invited address. */
  matchesCurrentUser: z.boolean(),
});
export type TenantInvitationPreview = z.infer<typeof tenantInvitationPreviewSchema>;
```

- [ ] **Step 2: Export it**

Add to `packages/contracts/src/index.ts`, in alphabetical position among the existing contract exports:

```ts
export * from './contracts/access';
```

- [ ] **Step 3: Rewire the backend catalog to the schema**

In `apps/api/src/modules/identity-access/domain/permission-catalog.ts`, replace the 24 hand-listed tenant entries (lines 21–45, the `// Tenant` block) with a generated block. Keep the platform and partner blocks exactly as they are.

```ts
import { tenantPermissionKeySchema, type ScopeLevel } from '@booking/contracts';

const TENANT_KEYS = tenantPermissionKeySchema.options.map(
  (key): { key: string; scopeLevel: ScopeLevel } => ({ key, scopeLevel: 'tenant' }),
);

export const PERMISSION_CATALOG: ReadonlyArray<{ key: string; scopeLevel: ScopeLevel }> = [
  // Platform
  // … keep the existing platform entries verbatim …
  ...TENANT_KEYS,
  // Partner
  // … keep the existing partner entries verbatim …
];
```

`keysOf('tenant')` and `SYSTEM_ROLES` below it keep working unchanged — they read from `PERMISSION_CATALOG`.

- [ ] **Step 4: Verify**

```bash
pnpm --filter=@booking/contracts build && pnpm --filter=@booking/api typecheck
```

Expected: both succeed. If `permission-catalog.ts` fails to typecheck, the enum order or a key spelling differs from the original list — diff the two lists rather than editing the enum to fit.

- [ ] **Step 5: Confirm the catalog is unchanged in content**

```bash
cd apps/api && pnpm exec tsx -e "import {PERMISSION_CATALOG} from './src/modules/identity-access/domain/permission-catalog'; console.log(PERMISSION_CATALOG.length, PERMISSION_CATALOG.filter(p=>p.scopeLevel==='tenant').length)"
```

Expected output: `52 24`. Any other number means a key was lost or duplicated — fix before committing, because a changed catalog would need a seed run.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/contracts/access.ts packages/contracts/src/index.ts apps/api/src/modules/identity-access/domain/permission-catalog.ts
git commit -m "feat(contracts): tenant access schemas, catalog builds tenant keys from them"
```

---

### Task 2: Migration and Prisma model for `tenant_invitations`

**Files:**
- Create: `apps/api/prisma/migrations/20260813000000_tenant_invitations/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (new enum + model; add the back-relation on `Tenant`)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma model `TenantInvitation` with fields `id, tenantId, email, roleIds, tokenHash, invitedByUserId, status, expiresAt, acceptedAt, acceptedUserId, createdAt, updatedAt`; enum `TenantInvitationStatus { pending, accepted, revoked }`.

- [ ] **Step 1: Write the migration**

```sql
-- apps/api/prisma/migrations/20260813000000_tenant_invitations/migration.sql
CREATE TYPE "tenant_invitation_status" AS ENUM ('pending', 'accepted', 'revoked');

CREATE TABLE "tenant_invitations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "email" CITEXT NOT NULL,
  "role_ids" UUID[] NOT NULL,
  "token_hash" TEXT NOT NULL,
  "invited_by_user_id" UUID,
  "status" "tenant_invitation_status" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "accepted_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tenant_invitations_accepted_user_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tenant_invitations_token_hash_key" ON "tenant_invitations"("token_hash");
CREATE INDEX "tenant_invitations_tenant_id_status_created_at_idx"
  ON "tenant_invitations"("tenant_id", "status", "created_at" DESC);

-- One live invitation per address per tenant. Revoked/accepted rows stay as history.
CREATE UNIQUE INDEX "tenant_invitations_pending_email_key"
  ON "tenant_invitations"("tenant_id", "email")
  WHERE "status" = 'pending';

ALTER TABLE "tenant_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_invitations"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_invitations" TO app_user, app_admin;
```

`invited_by_user_id` is nullable with `ON DELETE SET NULL`, not `ON DELETE CASCADE`: an accepted
invitation is a historical record of a role grant and must survive the inviter's account being
deleted — matching this schema's convention for other NOT-NULL "actor" audit columns
(`content_reports_handled_by_user_id_fkey`, `listing_revisions_submitted_by_user_id_fkey`,
`legal_document_versions_published_by_user_id_fkey`), all of which preserve the row via `SET NULL`
rather than destroying it via `CASCADE`.

Note for the implementer: the accept flow reads a row **before** any tenant context exists, so that read must run on `prisma.admin` (BYPASSRLS), exactly like `PermissionResolverService` does. RLS here protects the tenant-scoped list/revoke paths.

- [ ] **Step 2: Add the Prisma model**

Append to `apps/api/prisma/schema.prisma`, next to the other tenancy models:

```prisma
enum TenantInvitationStatus {
  pending
  accepted
  revoked

  @@map("tenant_invitation_status")
}

/// A pending invitation for someone to join a tenant with a set of roles.
/// `roleIds` is an array rather than a join table: an invitation lives 7 days,
/// and accept-time intersection against the tenant's live roles covers a role
/// deleted in the meantime.
model TenantInvitation {
  id              String                 @id @default(uuid(7)) @db.Uuid
  tenantId        String                 @map("tenant_id") @db.Uuid
  email           String                 @db.Citext
  roleIds         String[]               @map("role_ids") @db.Uuid
  tokenHash       String                 @unique @map("token_hash")
  invitedByUserId String?                @map("invited_by_user_id") @db.Uuid
  status          TenantInvitationStatus @default(pending)
  expiresAt       DateTime               @map("expires_at") @db.Timestamptz(6)
  acceptedAt      DateTime?              @map("accepted_at") @db.Timestamptz(6)
  acceptedUserId  String?                @map("accepted_user_id") @db.Uuid
  createdAt       DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, status, createdAt(sort: Desc)])
  @@map("tenant_invitations")
}
```

Add the back-relation to the `Tenant` model's relation list:

```prisma
  invitations TenantInvitation[]
```

- [ ] **Step 3: Apply and regenerate**

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
```

Expected: the migration applies cleanly and the client regenerates. If `prisma:deploy` reports drift, do **not** run `prisma migrate dev` — reset with `pnpm --filter=@booking/api exec prisma migrate reset` and re-run.

- [ ] **Step 4: Verify RLS coverage**

```bash
pnpm --filter=@booking/api check:rls && pnpm --filter=@booking/api typecheck
```

Expected: `check:rls` passes. It fails if `tenant_id` or the policy is missing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations/20260813000000_tenant_invitations apps/api/prisma/schema.prisma
git commit -m "feat(api): tenant_invitations table with RLS"
```

---

### Task 3: The access policy — every invariant in one framework-free file

This is the heart of the feature. Pure functions, no Nest, no Prisma, no clock reads — external facts arrive as arguments (the entity policy in `apps/api/CLAUDE.md`).

**Files:**
- Create: `apps/api/src/modules/identity-access/domain/tenant-access-policy.ts`
- Create: `apps/api/src/modules/identity-access/domain/errors/tenant-access-errors.ts`

**Interfaces:**
- Consumes: `TenantPermissionKey` from Task 1.
- Produces:
  - `assertGrantable(requested: readonly string[], callerHolds: ReadonlySet<string>): void`
  - `assertNotSelf(callerUserId: string, targetUserId: string): void`
  - `assertKeepsAManager(remaining: ReadonlyArray<{ userId: string; permissions: readonly string[] }>): void`
  - `diffRoleIds(current: readonly string[], next: readonly string[]): { add: string[]; remove: string[] }`
  - `invitationStateOf(row: { status: 'pending'|'accepted'|'revoked'; expiresAt: Date }, now: Date): TenantInvitationStatus`
  - error classes `PermissionEscalation`, `CannotEditSelf`, `LastManagerRemoved`, `SystemRoleImmutable`, `RoleInUse`, `RoleNotFound`, `MemberNotFound`, `InvitationNotFound`, `InvitationNotPending`, `InvitationEmailMismatch`, `InvitationRolesGone`, `InvitationAlreadyPending`

- [ ] **Step 1: Write the errors**

```ts
// apps/api/src/modules/identity-access/domain/errors/tenant-access-errors.ts
import { DomainError } from '../../../../shared/domain/domain-error';

/** Caller tried to grant a permission they do not themselves hold. */
export class PermissionEscalation extends DomainError {
  constructor(keys: readonly string[]) {
    super('PERMISSION_ESCALATION', 400, 'Cannot grant permissions you do not hold', { keys });
  }
}

/** A user may not change or remove their own roles. */
export class CannotEditSelf extends DomainError {
  constructor() {
    super('CANNOT_EDIT_SELF', 409, 'You cannot change your own roles');
  }
}

/** The operation would leave the tenant with nobody able to manage members. */
export class LastManagerRemoved extends DomainError {
  constructor() {
    super('LAST_MANAGER_REMOVED', 409, 'The tenant must keep at least one member manager');
  }
}

/** Pre-seeded roles (`is_system = true`) are shared across tenants and immutable. */
export class SystemRoleImmutable extends DomainError {
  constructor() {
    super('SYSTEM_ROLE_IMMUTABLE', 409, 'System roles cannot be edited or deleted');
  }
}

/** Deleting a role that people still hold would silently strip them (FK cascade). */
export class RoleInUse extends DomainError {
  constructor(memberCount: number) {
    super('ROLE_IN_USE', 409, 'Role is still assigned to members', { memberCount });
  }
}

/** A role id that is not assignable in this tenant (deleted, or another tenant's). */
export class RoleNotFound extends DomainError {
  constructor() {
    super('ROLE_NOT_FOUND', 404, 'Role not found');
  }
}

/** The target user holds no tenant-scoped assignment here. */
export class MemberNotFound extends DomainError {
  constructor() {
    super('MEMBER_NOT_FOUND', 404, 'Member not found');
  }
}

export class InvitationNotFound extends DomainError {
  constructor() {
    super('INVITATION_NOT_FOUND', 404, 'Invitation not found');
  }
}

/** Expired, revoked, or already accepted. */
export class InvitationNotPending extends DomainError {
  constructor() {
    super('INVITATION_NOT_PENDING', 409, 'Invitation is no longer valid');
  }
}

export class InvitationEmailMismatch extends DomainError {
  constructor() {
    super('INVITATION_EMAIL_MISMATCH', 403, 'Invitation was issued to a different address');
  }
}

/** Every role named by the invitation has been deleted since it was sent. */
export class InvitationRolesGone extends DomainError {
  constructor() {
    super('INVITATION_ROLES_GONE', 409, 'The roles in this invitation no longer exist');
  }
}

export class InvitationAlreadyPending extends DomainError {
  constructor() {
    super('INVITATION_ALREADY_PENDING', 409, 'This address already has a pending invitation');
  }
}
```

- [ ] **Step 2: Write the policy**

```ts
// apps/api/src/modules/identity-access/domain/tenant-access-policy.ts
import type { TenantInvitationStatus } from '@booking/contracts';
import {
  CannotEditSelf,
  LastManagerRemoved,
  PermissionEscalation,
} from './errors/tenant-access-errors';

/** The key whose disappearance locks a tenant out of its own staff management. */
export const MEMBER_MANAGE_KEY = 'tenant.members.manage';

/**
 * A caller may only hand out permissions they hold. Rejects with the offending
 * keys rather than silently trimming them — a quietly weakened role is worse
 * than a refused one, because nobody learns the role is not what they asked for.
 */
export function assertGrantable(
  requested: readonly string[],
  callerHolds: ReadonlySet<string>,
): void {
  const excess = requested.filter((key) => !callerHolds.has(key));
  if (excess.length > 0) throw new PermissionEscalation(excess);
}

/** Demotion goes through someone else, so a mis-click cannot strand the tenant. */
export function assertNotSelf(callerUserId: string, targetUserId: string): void {
  if (callerUserId === targetUserId) throw new CannotEditSelf();
}

/**
 * `remaining` is the tenant's membership AS IT WOULD BE after the operation.
 * Checked on effective permissions, not role names: a custom role can carry
 * `tenant.members.manage` too, and the `Tenant Owner` name means nothing to the guard.
 */
export function assertKeepsAManager(
  remaining: ReadonlyArray<{ userId: string; permissions: readonly string[] }>,
): void {
  const stillManaged = remaining.some((m) => m.permissions.includes(MEMBER_MANAGE_KEY));
  if (!stillManaged) throw new LastManagerRemoved();
}

/** Editing a member replaces the whole role set; the caller sends the target state. */
export function diffRoleIds(
  current: readonly string[],
  next: readonly string[],
): { add: string[]; remove: string[] } {
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  return {
    add: next.filter((id) => !currentSet.has(id)),
    remove: current.filter((id) => !nextSet.has(id)),
  };
}

/** "Expired" is derived, never stored — `now` is passed in so this stays clock-free. */
export function invitationStateOf(
  row: { status: 'pending' | 'accepted' | 'revoked'; expiresAt: Date },
  now: Date,
): TenantInvitationStatus {
  if (row.status !== 'pending') return row.status;
  return row.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending';
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

Expected: both pass. If lint complains that `domain/` imports `application/`, you added an import that breaks the eslint boundary rule — the policy must import nothing but contracts types and its own errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/identity-access/domain/tenant-access-policy.ts apps/api/src/modules/identity-access/domain/errors/tenant-access-errors.ts
git commit -m "feat(api): tenant access policy - escalation, self-edit and lockout rules"
```

---

### Task 4: Ports and Prisma repositories

**Files:**
- Create: `apps/api/src/modules/identity-access/domain/ports/tenant-member-repository.port.ts`
- Create: `apps/api/src/modules/identity-access/domain/ports/tenant-role-repository.port.ts`
- Create: `apps/api/src/modules/identity-access/domain/ports/tenant-invitation-repository.port.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/repositories/prisma-tenant-member.repository.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/repositories/prisma-tenant-role.repository.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/repositories/prisma-tenant-invitation.repository.ts`

**Interfaces:**
- Consumes: `PrismaTx` from `shared/tenant-context/tenant-db.service`; `PrismaService`.
- Produces: the three symbols `TENANT_MEMBER_REPOSITORY`, `TENANT_ROLE_REPOSITORY`, `TENANT_INVITATION_REPOSITORY` and the interfaces below. Every use-case in Tasks 5–8 injects these.

- [ ] **Step 1: Write the member port**

```ts
// apps/api/src/modules/identity-access/domain/ports/tenant-member-repository.port.ts
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const TENANT_MEMBER_REPOSITORY = Symbol('TENANT_MEMBER_REPOSITORY');

export interface MemberRow {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  roles: { id: string; name: string }[];
  permissions: string[];
  joinedAt: Date;
}

export interface ITenantMemberRepository {
  /** Every user holding a tenant-scoped assignment (partner_id IS NULL), grouped. */
  list(tx: PrismaTx, tenantId: string): Promise<MemberRow[]>;
  findOne(tx: PrismaTx, tenantId: string, userId: string): Promise<MemberRow | null>;
  addRoles(tx: PrismaTx, tenantId: string, userId: string, roleIds: readonly string[]): Promise<void>;
  removeRoles(tx: PrismaTx, tenantId: string, userId: string, roleIds: readonly string[]): Promise<void>;
  /** Deletes every tenant-scoped assignment of that user. */
  removeAll(tx: PrismaTx, tenantId: string, userId: string): Promise<void>;
  findUserIdByEmail(tx: PrismaTx, email: string): Promise<string | null>;
  /**
   * User ids holding this role IN THIS TENANT. Editing a role changes what its
   * holders may do, so each of them needs their permission cache invalidated.
   */
  holdersOfRole(tx: PrismaTx, tenantId: string, roleId: string): Promise<string[]>;
}
```

- [ ] **Step 2: Write the role port**

```ts
// apps/api/src/modules/identity-access/domain/ports/tenant-role-repository.port.ts
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const TENANT_ROLE_REPOSITORY = Symbol('TENANT_ROLE_REPOSITORY');

export interface RoleRow {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export interface ITenantRoleRepository {
  /** System tenant roles (shared, `tenant_id IS NULL`) + this tenant's own. */
  list(tx: PrismaTx, tenantId: string): Promise<RoleRow[]>;
  findById(tx: PrismaTx, tenantId: string, roleId: string): Promise<RoleRow | null>;
  /** Filters `roleIds` down to the ones assignable in this tenant. */
  filterAssignable(tx: PrismaTx, tenantId: string, roleIds: readonly string[]): Promise<RoleRow[]>;
  create(tx: PrismaTx, tenantId: string, name: string, permissions: readonly string[]): Promise<string>;
  /**
   * Replaces name + the whole permission set. Custom roles only. Returns false
   * when no role with that id belongs to this tenant, in which case nothing —
   * name or permissions — was written.
   */
  update(tx: PrismaTx, tenantId: string, roleId: string, name: string, permissions: readonly string[]): Promise<boolean>;
  delete(tx: PrismaTx, tenantId: string, roleId: string): Promise<void>;
}
```

- [ ] **Step 3: Write the invitation port**

```ts
// apps/api/src/modules/identity-access/domain/ports/tenant-invitation-repository.port.ts
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const TENANT_INVITATION_REPOSITORY = Symbol('TENANT_INVITATION_REPOSITORY');

export interface InvitationRow {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  roleIds: string[];
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date;
  createdAt: Date;
  invitedByName: string | null;
}

export interface CreateInvitationData {
  tenantId: string;
  email: string;
  roleIds: readonly string[];
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
}

export interface ITenantInvitationRepository {
  list(tx: PrismaTx, tenantId: string): Promise<InvitationRow[]>;
  create(tx: PrismaTx, data: CreateInvitationData): Promise<string>;
  /** Sets status='revoked'. Returns false when it was not pending any more. */
  revoke(tx: PrismaTx, tenantId: string, invitationId: string): Promise<boolean>;
  /**
   * Token lookup for the accept flow. Runs on the ADMIN pool: the caller has no
   * membership in the tenant yet, so no tenant context exists to satisfy RLS.
   */
  findByTokenHash(tokenHash: string): Promise<InvitationRow | null>;
  /**
   * CAS accept: stamps accepted_at/accepted_user_id only while still pending, so
   * two concurrent accepts cannot both create assignments. Returns false if lost.
   */
  markAccepted(tx: PrismaTx, invitationId: string, userId: string): Promise<boolean>;
}
```

- [ ] **Step 4: Implement the three Prisma repositories**

Follow `prisma-legal-document.repository.ts` for shape. The non-obvious parts, which must be written exactly:

```ts
// prisma-tenant-member.repository.ts — list()
const rows = await tx.roleAssignment.findMany({
  where: { tenantId, partnerId: null },
  include: {
    user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
    role: { include: { rolePermissions: true } },
  },
  orderBy: { createdAt: 'asc' },
});
// Group by user; union permission keys across that user's roles — the same
// shape PrismaSessionInfoReader produces, so the two never disagree.
```

```ts
// prisma-tenant-role.repository.ts — list()
// System tenant roles are SHARED (tenant_id IS NULL, is_system = true) and must
// appear alongside the tenant's own. memberCount counts assignments IN THIS
// TENANT only — a shared role's holders elsewhere are none of this tenant's business.
const roles = await tx.role.findMany({
  where: { scopeLevel: 'tenant', OR: [{ tenantId }, { tenantId: null, isSystem: true }] },
  include: {
    rolePermissions: true,
    _count: { select: { roleAssignments: { where: { tenantId, partnerId: null } } } },
  },
  orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
});
```

```ts
// prisma-tenant-role.repository.ts — update()
// The scoped role write runs FIRST and gates everything else.
const claimed = await tx.role.updateMany({ where: { id: roleId, tenantId }, data: { name } });
if (claimed.count !== 1) return false;

await tx.rolePermission.deleteMany({ where: { roleId } });
await tx.rolePermission.createMany({
  data: permissions.map((permissionKey) => ({ roleId, permissionKey })),
});
return true;
```
The `{ id: roleId, tenantId }` match is load-bearing, not decorative, for two independent
reasons — and it must run *before* the permission writes, not after. First, the `roles` RLS
policy has no separate `WITH CHECK`, so Postgres reuses its `USING` clause (`tenant_id =
current tenant OR tenant_id IS NULL`) as the write check too, meaning an unscoped `role.update`
would let any tenant rename a shared system role. Second, and more importantly,
`role_permissions` has **no `tenant_id` column and no RLS policy at all** — there is no
database-level protection on it whatsoever. If the permission delete+recreate ran before (or
regardless of) the scoped match, a caller could rewrite a shared system role's permission set
platform-wide even if the cosmetic name write silently no-opped. The role write's row count is
therefore the *only* ownership check in this method, and it must gate, not just accompany, the
permission writes.

```ts
// prisma-tenant-invitation.repository.ts — findByTokenHash()
// ADMIN pool on purpose: no tenant context exists at accept time.
const row = await this.prisma.admin.tenantInvitation.findUnique({
  where: { tokenHash },
  include: { tenant: { select: { name: true } } },
});
```

```ts
// prisma-tenant-invitation.repository.ts — markAccepted()
const res = await tx.tenantInvitation.updateMany({
  where: { id: invitationId, status: 'pending' },   // CAS
  data: { status: 'accepted', acceptedAt: new Date(), acceptedUserId: userId },
});
return res.count === 1;
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/identity-access/domain/ports apps/api/src/modules/identity-access/infrastructure/repositories
git commit -m "feat(api): tenant member, role and invitation repository ports"
```

---

### Task 5: Role endpoints

**Files:**
- Create: `apps/api/src/modules/identity-access/application/use-cases/list-tenant-roles.use-case.ts`
- Create: `.../list-assignable-tenant-roles.use-case.ts`
- Create: `.../create-tenant-role.use-case.ts`
- Create: `.../update-tenant-role.use-case.ts`
- Create: `.../delete-tenant-role.use-case.ts`
- Create: `apps/api/src/modules/identity-access/application/tenant-access.mapper.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/http/dto/tenant-access.dto.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/http/tenant-role.controller.ts`
- Modify: the identity-access Nest module — register the use-cases, bind the three repository symbols, add the controller

**Interfaces:**
- Consumes: Task 3 policy + errors, Task 4 ports, Task 1 contracts.
- Produces: `TenantRoleController` serving `GET/POST/PATCH/DELETE /tenant/roles` and `GET /tenant/roles/assignable`; mapper functions `toTenantRoleSummary(row)`, `toTenantRoleDetail(row)`, `toTenantMember(row)`, `toTenantInvitation(row, now)` used by Tasks 6–8.

- [ ] **Step 1: Write `create-tenant-role.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { CreateTenantRoleInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../domain/ports/permission-resolver.port';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import { assertGrantable } from '../../domain/tenant-access-policy';

/**
 * Creates a tenant-owned role (`tenant_id` set, `is_system = false`) from the
 * tenant permission catalog. The caller's own effective permissions bound what
 * the new role may contain, so a custom-role holder cannot mint a stronger role.
 */
@Injectable()
export class CreateTenantRoleUseCase {
  constructor(
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    input: CreateTenantRoleInput,
    ctx: { userId: string },
  ): Promise<{ id: string }> {
    const callerHolds = await this.resolver.resolve(ctx.userId, { tenantId });
    assertGrantable(input.permissions, callerHolds);

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const id = await this.roles.create(tx, tenantId, input.name, input.permissions);
      await this.audit.write(tx, {
        tenantId,
        actorUserId: ctx.userId,
        action: 'role.created',
        entityType: 'role',
        entityId: id,
        data: { name: input.name, permissions: input.permissions },
      });
      return { id };
    });
  }
}
```

- [ ] **Step 2: Write `update-tenant-role.use-case.ts`**

Same shape, plus three guards before writing:

```ts
const role = await this.roles.findById(tx, tenantId, roleId);
if (!role) throw new RoleNotFound();          // add to tenant-access-errors.ts: 404 ROLE_NOT_FOUND
if (role.isSystem) throw new SystemRoleImmutable();
```

**Lockout, not just escalation.** `assertGrantable(input.permissions, callerHolds)` bounds what the
edit can *add* — it says nothing about what the edit *removes*. A role edit changes what every
holder of that role may do, exactly as a member removal does (Task 6's invariant #1), so it needs
the same `assertKeepsAManager` check — on the membership as it would be with THIS role's permissions
replaced, not the membership before the edit. There is deliberately no `assertNotSelf` here: editing
a role you hold yourself is a normal thing an owner does, and the lockout check (not a self-edit ban)
is the correct guard for it.

```ts
// A role edit changes what its holders may do, so it can strand a tenant just as
// a member removal can — and unlike removal there is no assertNotSelf here, because
// editing a role you hold is legitimate. Recompute every member's effective set with
// THIS role's new permissions substituted in, then assert someone can still manage members.
const allRoles = await this.roles.list(tx, tenantId);
const permsByRole = new Map(
  allRoles.map((r) => [r.id, r.id === roleId ? input.permissions : r.permissions]),
);
const members = await this.members.list(tx, tenantId);
assertKeepsAManager(
  members.map((m) => ({
    userId: m.userId,
    permissions: [...new Set(m.roles.flatMap((r) => permsByRole.get(r.id) ?? []))],
  })),
);
```

`UpdateTenantRoleUseCase` already injects `TENANT_MEMBER_REPOSITORY` for the post-write
`holdersOfRole` call below, so this needs no new constructor dependency. Uses only existing port
methods (`ITenantRoleRepository.list`, `ITenantMemberRepository.list`) — no new repository method.

Then perform the write itself and check its result:

```ts
const updated = await this.roles.update(tx, tenantId, roleId, input.name, input.permissions);
if (!updated) throw new RoleNotFound();
```

`update()` returns `false` when its own tenant-scoped match didn't hit — a role deleted between
the `findById` guard above and this call, for instance. That match is `role_permissions`' only
protection (it has no `tenant_id` column and no RLS policy of its own — see Task 4), so this
use-case must trust `update()`'s return value and never assume the earlier `findById` read is
still true by the time the write runs.

After the write, **every holder's cached permissions are now stale**:

```ts
// A role edit changes what its holders may do. Without this, holders keep the
// old permission set for up to CACHE_TTL_SECONDS = 60 — silently, with no
// error and no log line to notice it by.
const holders = await this.members.holdersOfRole(tx, tenantId, roleId);
```

Collect `holders` inside the transaction, then call `this.resolver.invalidate(userId)` for each **after** `forTenant` returns — the cache must not be cleared before the write is durable, or a concurrent request could refill it with the old set.

- [ ] **Step 3: Write `delete-tenant-role.use-case.ts`**

```ts
const role = await this.roles.findById(tx, tenantId, roleId);
if (!role) throw new RoleNotFound();
if (role.isSystem) throw new SystemRoleImmutable();
// MANDATORY. RoleAssignment.role declares onDelete: Cascade (schema.prisma:719),
// so deleting a role that people hold would silently strip them of it.
// This is also why delete needs no assertKeepsAManager: memberCount > 0 already
// refuses to delete a role anyone holds, so a successful delete cannot change
// anyone's permissions — unlike update, there is nothing here for it to guard.
if (role.memberCount > 0) throw new RoleInUse(role.memberCount);
await this.roles.delete(tx, tenantId, roleId);
```

- [ ] **Step 4: Write the two read use-cases and the mapper**

`ListTenantRolesUseCase` returns `TenantRoleDetail[]`; `ListAssignableTenantRolesUseCase` returns `RoleRef[]`. Both wrap `forTenant` and map through the mapper below.

```ts
// apps/api/src/modules/identity-access/application/tenant-access.mapper.ts
import type {
  RoleRef, TenantInvitation, TenantMember, TenantPermissionKey,
  TenantRoleDetail, TenantRoleSummary,
} from '@booking/contracts';
import type { RoleRow } from '../domain/ports/tenant-role-repository.port';
import type { MemberRow } from '../domain/ports/tenant-member-repository.port';
import type { InvitationRow } from '../domain/ports/tenant-invitation-repository.port';
import { invitationStateOf } from '../domain/tenant-access-policy';

/**
 * Fields are listed explicitly. Never spread a repository row into a response —
 * persistence-only keys become accidental wire contract that way.
 */
export function toTenantRoleSummary(row: RoleRow): TenantRoleSummary {
  return { id: row.id, name: row.name, isSystem: row.isSystem, memberCount: row.memberCount };
}

export function toTenantRoleDetail(row: RoleRow): TenantRoleDetail {
  return {
    ...toTenantRoleSummary(row),
    permissions: row.permissions as TenantPermissionKey[],
  };
}

export function toRoleRef(row: RoleRow): RoleRef {
  return { id: row.id, name: row.name };
}

export function toTenantMember(row: MemberRow): TenantMember {
  return {
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    roles: row.roles.map((r) => ({ id: r.id, name: r.name })),
    permissions: row.permissions as TenantPermissionKey[],
    joinedAt: row.joinedAt.toISOString(),
  };
}

export function toTenantInvitation(
  row: InvitationRow,
  roleNames: ReadonlyMap<string, string>,
  now: Date,
): TenantInvitation {
  return {
    id: row.id,
    email: row.email,
    // A role deleted since the invite was sent simply drops out of the display.
    roles: row.roleIds.flatMap((id) => {
      const name = roleNames.get(id);
      return name ? [{ id, name }] : [];
    }),
    status: invitationStateOf(row, now),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedByName: row.invitedByName,
  };
}
```

- [ ] **Step 5: Write the controller**

```ts
// apps/api/src/modules/identity-access/infrastructure/http/tenant-role.controller.ts
@ApiTags('tenant: roles')
@Controller('tenant/roles')
export class TenantRoleController {
  constructor(
    private readonly listRoles: ListTenantRolesUseCase,
    private readonly listAssignable: ListAssignableTenantRolesUseCase,
    private readonly createRole: CreateTenantRoleUseCase,
    private readonly updateRole: UpdateTenantRoleUseCase,
    private readonly deleteRole: DeleteTenantRoleUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  // Deliberately `members.manage`, not `roles.manage`: the invite form needs role
  // NAMES to offer, and @RequirePermissions is AND — one endpoint cannot serve
  // "either permission". Returns {id, name} only.
  @RequirePermissions('tenant.members.manage')
  @Get('assignable')
  assignable(): Promise<RoleRef[]> {
    return this.listAssignable.execute(this.tenantContext.tenantIdOrThrow());
  }

  @RequirePermissions('tenant.roles.manage')
  @Get()
  list(): Promise<TenantRoleDetail[]> {
    return this.listRoles.execute(this.tenantContext.tenantIdOrThrow());
  }

  @RequirePermissions('tenant.roles.manage')
  @Post()
  create(
    @Body() input: CreateTenantRoleDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<{ id: string }> {
    return this.createRole.execute(this.tenantContext.tenantIdOrThrow(), input, {
      userId: principal.userId,
    });
  }

  @RequirePermissions('tenant.roles.manage')
  @Patch(':roleId')
  @HttpCode(204)
  async update(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() input: UpdateTenantRoleDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.updateRole.execute(this.tenantContext.tenantIdOrThrow(), roleId, input, {
      userId: principal.userId,
    });
  }

  @RequirePermissions('tenant.roles.manage')
  @Delete(':roleId')
  @HttpCode(204)
  async remove(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.deleteRole.execute(this.tenantContext.tenantIdOrThrow(), roleId, {
      userId: principal.userId,
    });
  }
}
```

These writes deliberately carry no `@UseGuards(RequireActiveSubscriptionGuard)`, unlike every
other tenant-settings mutation: staff/role management must stay available when a subscription
lapses so an owner can revoke a departed employee's access, and separately, the guard lives in
`tenancy`, which already imports `identity-access`'s decorators in five controllers — importing
it back would close `identity-access → tenancy → identity-access`, which
`pnpm check:module-cycles` rejects. Do not add it back in Task 6/7 either.

Note the `assignable` route is declared **before** any `:roleId` route so the literal segment wins.

- [ ] **Step 5b: Register everything in the Nest module**

Add the five use-cases to `providers`, the controller to `controllers`, and bind:

```ts
{ provide: TENANT_ROLE_REPOSITORY, useClass: PrismaTenantRoleRepository },
{ provide: TENANT_MEMBER_REPOSITORY, useClass: PrismaTenantMemberRepository },
{ provide: TENANT_INVITATION_REPOSITORY, useClass: PrismaTenantInvitationRepository },
```

- [ ] **Step 6: Verify by calling it**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
pnpm --filter=@booking/api dev   # separate terminal
```

Then, with a tenant-owner session cookie, confirm three things by hand:

```bash
# 1. Lists system + custom roles
curl -s localhost:3000/tenant/roles -H "x-tenant-id: <bookingstudio-id>" -b "sid=<...>" | jq length
# 2. Escalation is refused (expects 400 PERMISSION_ESCALATION when the caller lacks a key)
# 3. Deleting a role in use returns 409 ROLE_IN_USE, not a silent cascade
```

Expected: the list is non-empty and includes `Tenant Owner`, `Manager`, `Finance` with `isSystem: true`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/identity-access
git commit -m "feat(api): tenant role endpoints with escalation and cascade guards"
```

---

### Task 6: Member endpoints

**Files:**
- Create: `.../use-cases/list-tenant-members.use-case.ts`
- Create: `.../use-cases/set-tenant-member-roles.use-case.ts`
- Create: `.../use-cases/remove-tenant-member.use-case.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/http/tenant-member.controller.ts`
- Modify: the identity-access Nest module

**Interfaces:**
- Consumes: Task 3 policy, Task 4 ports, Task 5 mapper.
- Produces: `GET /tenant/members`, `PUT /tenant/members/:userId/roles`, `DELETE /tenant/members/:userId`.

- [ ] **Step 1: Write `set-tenant-member-roles.use-case.ts`**

This carries three of the seven invariants; write it exactly.

```ts
async execute(
  tenantId: string,
  targetUserId: string,
  input: SetTenantMemberRolesInput,
  ctx: { userId: string },
): Promise<void> {
  assertNotSelf(ctx.userId, targetUserId);
  const callerHolds = await this.resolver.resolve(ctx.userId, { tenantId });

  await this.tenantDb.forTenant(tenantId, async (tx) => {
    const member = await this.members.findOne(tx, tenantId, targetUserId);
    if (!member) throw new MemberNotFound();          // 404 MEMBER_NOT_FOUND

    // Only roles that exist in this tenant, and only permissions the caller holds.
    const roles = await this.roles.filterAssignable(tx, tenantId, input.roleIds);
    if (roles.length !== input.roleIds.length) throw new RoleNotFound();
    assertGrantable(roles.flatMap((r) => r.permissions), callerHolds);

    // Lockout check on the membership AS IT WOULD BE.
    const nextPermissions = [...new Set(roles.flatMap((r) => r.permissions))];
    const all = await this.members.list(tx, tenantId);
    assertKeepsAManager(
      all.map((m) =>
        m.userId === targetUserId ? { userId: m.userId, permissions: nextPermissions } : m,
      ),
    );

    const { add, remove } = diffRoleIds(member.roles.map((r) => r.id), input.roleIds);
    if (remove.length) await this.members.removeRoles(tx, tenantId, targetUserId, remove);
    if (add.length) await this.members.addRoles(tx, tenantId, targetUserId, add);

    await this.audit.write(tx, {
      tenantId,
      actorUserId: ctx.userId,
      action: 'member.roles_changed',
      entityType: 'user',
      entityId: targetUserId,
      data: { added: add, removed: remove },
    });
  });

  // AFTER the tx commits. Skipping this leaves the member acting on the old
  // permission set for up to 60s (permission-resolver.service.ts:11) — silently.
  await this.resolver.invalidate(targetUserId);
}
```

- [ ] **Step 2: Write `remove-tenant-member.use-case.ts`**

```ts
assertNotSelf(ctx.userId, targetUserId);
// … inside forTenant:
const all = await this.members.list(tx, tenantId);
assertKeepsAManager(all.filter((m) => m.userId !== targetUserId));
await this.members.removeAll(tx, tenantId, targetUserId);
await this.audit.write(tx, { …, action: 'member.removed', entityType: 'user', entityId: targetUserId });
// … after the tx:
await this.resolver.invalidate(targetUserId);
```

Removal deletes assignments only. It does **not** revoke `sessions` rows — the member keeps a signed-in session but loses the tenant workspace entirely once the cache clears. That is the documented behaviour, not an oversight.

- [ ] **Step 3: Write `list-tenant-members.use-case.ts` and the controller**

All three routes declare `@RequirePermissions('tenant.members.manage')`. None of them additionally
carry `@UseGuards(RequireActiveSubscriptionGuard)` — unlike every other tenant-settings mutation,
staff management deliberately stays available when a subscription lapses (an owner must still be
able to revoke a departed employee's access), and the guard lives in `tenancy`, which already
imports `identity-access`'s decorators, so importing it back would close a module cycle
`check:module-cycles` rejects. See Task 5's controller for the full reasoning.

- [ ] **Step 4: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

With the API running, confirm by hand: `GET /tenant/members` for BookingStudio returns the seeded owner with role `Tenant Owner`; `DELETE` on **yourself** returns 409 `CANNOT_EDIT_SELF`; `DELETE` on the only owner returns 409 `LAST_MANAGER_REMOVED`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity-access
git commit -m "feat(api): tenant member endpoints with lockout and self-edit guards"
```

---

### Task 7: Invitation endpoints and the outbox event

**Files:**
- Create: `.../use-cases/invite-tenant-member.use-case.ts`
- Create: `.../use-cases/list-tenant-invitations.use-case.ts`
- Create: `.../use-cases/revoke-tenant-invitation.use-case.ts`
- Create: `apps/api/src/modules/identity-access/domain/ports/invitation-token.port.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/services/sha256-invitation-token.service.ts`
- Modify: `tenant-member.controller.ts` (add the three invitation routes)

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: `POST/GET /tenant/members/invitations`, `DELETE /tenant/members/invitations/:id`; outbox event `tenant.member_invited` with payload `{ invitationId, email, token, roleNames: string[], tenantName: string }`.

- [ ] **Step 1: Write the token port and adapter**

```ts
// invitation-token.port.ts
export const INVITATION_TOKEN = Symbol('INVITATION_TOKEN');
export interface IInvitationToken {
  /** Returns the clear token (mailed) and its hash (stored) — never store the clear one. */
  issue(): { token: string; tokenHash: string };
  hash(token: string): string;
}
```

The adapter uses `randomBytes(32).toString('base64url')` and `createHash('sha256')`, mirroring how sessions are stored (ADR 0001).

- [ ] **Step 2: Write `invite-tenant-member.use-case.ts`**

```ts
async execute(tenantId: string, input: InviteTenantMemberInput, ctx: { userId: string }): Promise<void> {
  const callerHolds = await this.resolver.resolve(ctx.userId, { tenantId });
  const { token, tokenHash } = this.tokens.issue();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await this.tenantDb.forTenant(tenantId, async (tx) => {
    const roles = await this.roles.filterAssignable(tx, tenantId, input.roleIds);
    if (roles.length !== input.roleIds.length) throw new RoleNotFound();
    assertGrantable(roles.flatMap((r) => r.permissions), callerHolds);

    const invitationId = await this.invitations.create(tx, {
      tenantId, email: input.email, roleIds: input.roleIds,
      tokenHash, invitedByUserId: ctx.userId, expiresAt,
    });

    // Outbox, not a direct send: the mail must not escape a rolled-back invite.
    await this.outbox.emit(tx, {
      tenantId,
      eventType: 'tenant.member_invited',
      payload: { invitationId, email: input.email, token, roleNames: roles.map((r) => r.name) },
    });

    await this.audit.write(tx, {
      tenantId, actorUserId: ctx.userId, action: 'member.invited',
      entityType: 'tenant_invitation', entityId: invitationId,
      data: { email: input.email, roleIds: input.roleIds },
    });
  });
}
```

The partial unique index from Task 2 turns a duplicate pending invite into a Prisma `P2002`. Catch it in the repository's `create` and rethrow `InvitationAlreadyPending` — **never let a Prisma error reach the client** (`apps/api/CLAUDE.md`).

- [ ] **Step 3: Write list + revoke, and add the routes**

`ListTenantInvitationsUseCase` maps each row through `invitationStateOf(row, new Date())` so an expired row reports `expired` without a stored state. `RevokeTenantInvitationUseCase` throws `InvitationNotPending` when `revoke()` returns false.

Like Task 6, the two writes added to `tenant-member.controller.ts` here (`POST .../invitations`,
`DELETE .../invitations/:id`) carry no `@UseGuards(RequireActiveSubscriptionGuard)` — same ruling:
staff/role management stays available when billing lapses, and the guard lives in `tenancy`, whose
import back into `identity-access` would close a module cycle `check:module-cycles` rejects.

- [ ] **Step 4: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm check:module-cycles
```

`check:module-cycles` matters here: the use-case must not import anything from `notification`.

With the API running: POST an invitation, then confirm the row exists and an `outbox_events` row of type `tenant.member_invited` was written in the same transaction.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity-access
git commit -m "feat(api): tenant member invitations emitted through the outbox"
```

---

### Task 8: The accept flow

**Files:**
- Create: `.../use-cases/get-invitation-preview.use-case.ts`
- Create: `.../use-cases/accept-tenant-invitation.use-case.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/http/me-invitation.controller.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 7.
- Produces: `GET /auth/invitations/:token` → `TenantInvitationPreview`; `POST /auth/invitations/:token/accept` → 204.

- [ ] **Step 1: Write the controller**

```ts
@ApiTags('me: invitations')
@Controller('auth/invitations')
export class MeInvitationController {
  /**
   * @AuthenticatedOnly, NOT @RequirePermissions: the recipient has no membership
   * in the tenant yet, so any `tenant.*` requirement would 403 exactly the people
   * this route exists for. The tenant comes from the invitation row — never from
   * the x-tenant-id header, which the guard does not verify on this path.
   */
  constructor(
    private readonly preview: GetInvitationPreviewUseCase,
    private readonly acceptInvitation: AcceptTenantInvitationUseCase,
  ) {}

  @AuthenticatedOnly()
  @Get(':token')
  previewRoute(
    @Param('token') token: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TenantInvitationPreview> {
    return this.preview.execute(token, { userId: principal.userId, email: principal.email });
  }

  @AuthenticatedOnly()
  @Post(':token/accept')
  @HttpCode(204)
  async acceptRoute(
    @Param('token') token: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.acceptInvitation.execute(token, {
      userId: principal.userId,
      email: principal.email,
    });
  }
}
```

- [ ] **Step 2: Write `accept-tenant-invitation.use-case.ts`**

```ts
async execute(token: string, ctx: { userId: string; email: string }): Promise<void> {
  const row = await this.invitations.findByTokenHash(this.tokens.hash(token));
  if (!row) throw new InvitationNotFound();
  if (invitationStateOf(row, new Date()) !== 'pending') throw new InvitationNotPending();
  // citext in the DB, but this comparison is in JS — normalise both sides.
  if (row.email.toLowerCase() !== ctx.email.toLowerCase()) throw new InvitationEmailMismatch();

  await this.tenantDb.forTenant(row.tenantId, async (tx) => {
    // A role deleted since the invite was sent is dropped here rather than failing
    // the whole accept — unless every one of them is gone.
    const roles = await this.roles.filterAssignable(tx, row.tenantId, row.roleIds);
    if (roles.length === 0) throw new InvitationRolesGone();

    const won = await this.invitations.markAccepted(tx, row.id, ctx.userId);
    if (!won) throw new InvitationNotPending();       // lost the CAS race

    // ADD to any existing roles, never replace: re-inviting an existing member
    // grants extra roles and must never quietly remove one.
    const existing = await this.members.findOne(tx, row.tenantId, ctx.userId);
    const held = new Set(existing?.roles.map((r) => r.id) ?? []);
    const toAdd = roles.map((r) => r.id).filter((id) => !held.has(id));
    if (toAdd.length) await this.members.addRoles(tx, row.tenantId, ctx.userId, toAdd);

    await this.audit.write(tx, {
      tenantId: row.tenantId, actorUserId: ctx.userId, action: 'member.invitation_accepted',
      entityType: 'tenant_invitation', entityId: row.id, data: { roleIds: toAdd },
    });
  });

  await this.resolver.invalidate(ctx.userId);
}
```

`GetInvitationPreviewUseCase` performs the same lookup but throws nothing for a mismatch — it returns `matchesCurrentUser: false` so the screen can explain the situation instead of erroring.

- [ ] **Step 3: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

By hand: accept with the wrong account → 403 `INVITATION_EMAIL_MISMATCH`; accept twice → second returns 409 `INVITATION_NOT_PENDING`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/identity-access
git commit -m "feat(api): accept a tenant invitation"
```

---

### Task 9: The invitation email

**Files:**
- Modify: `apps/api/src/modules/notification/domain/notification-plan.ts` (add the template id)
- Modify: `apps/api/src/modules/notification/infrastructure/email/react-email.renderer.tsx` (COPY entry, vi + en)
- Create: `apps/api/src/modules/notification/application/use-cases/dispatch-member-invitation-event.use-case.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/http/notification.module.ts:77-125`

**Interfaces:**
- Consumes: the `tenant.member_invited` payload from Task 7.
- Produces: a delivered email whose CTA points at `https://<tenant dashboard host>/invitations/<token>`.

- [ ] **Step 1: Add the template**

Add `'tenant_member_invited'` to `NotificationTemplateId`, and a COPY entry in both `vi` and `en` using the existing `{placeholder}` interpolation. Vietnamese subject: `{tenantName} mời bạn tham gia quản trị`.

- [ ] **Step 2: Build the CTA URL from the tenant's dashboard domain**

```ts
// Since the dashboard became host multi-tenant, /tenant exists ONLY on the
// tenant's own console host. A link to the platform host strands the recipient.
// Same source PrismaSessionInfoReader:30-36 reads.
const domain = await tx.tenantDomain.findFirst({
  where: { tenantId, kind: 'dashboard', isPrimary: true, verifiedAt: { not: null } },
  select: { hostname: true },
});
const url = `https://${domain.hostname}/invitations/${token}`;
```

If no verified dashboard domain exists, log and skip rather than mailing a broken link — mirror how `notification.module.ts:127-133` skips an unroutable event instead of crashing.

- [ ] **Step 3: Register the handler**

In `onModuleInit`, beside the `legal.document_published` registration:

```ts
this.registry.register('tenant.member_invited', (event) => {
  const tenantId = this.requireTenantId(event.eventType, event.tenantId);
  if (!tenantId) return Promise.resolve();
  return this.dispatchMemberInvitationEvent.execute(tenantId, invitationPayloadOf(event.payload));
});
```

- [ ] **Step 4: Verify end to end**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm check:module-cycles
```

With the API running and `docker compose up -d`: POST an invitation, then open Mailpit at `localhost:8025`. Expected: one mail, subject in Vietnamese, CTA host `admin.bookingstudio.localhost`. Clicking it 404s for now — the screen arrives in Task 14.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notification
git commit -m "feat(api): invitation email delivered to the tenant console host"
```

---

### Task 10: Dashboard data layer

**Files:**
- Modify: `apps/dashboard/app/constants/api-paths.ts` (tenant section)
- Modify: `apps/dashboard/app/constants/paths.ts` (tenant section)
- Create: `apps/dashboard/app/features/tenant/server/members-loader.server.ts`
- Create: `apps/dashboard/app/features/tenant/server/members-actions.server.ts`
- Create: `apps/dashboard/app/constants/permissions.ts`

**Interfaces:**
- Consumes: Task 1 contracts; `requireTenant` from `~/features/tenant/server/tenant.server`.
- Produces: `apiPaths.tenant.members`, `.memberRoles(userId)`, `.member(userId)`, `.invitations`, `.invitation(id)`, `.roles`, `.rolesAssignable`, `.role(roleId)`; `dashboardPaths.tenant.members`, `.membersSection(section)`, `.memberInvite`, `.member(userId)`, `.roles`, `.roleNew`, `.roleEdit(roleId)`, `dashboardPaths.invitationAccept(token)`; `loadTenantMembers(request)`; `handleMembersAction({ request })`; `TENANT_PERMISSION_LABELS` and `TENANT_PERMISSION_GROUPS`.

- [ ] **Step 1: Add the path builders**

```ts
// api-paths.ts, inside `tenant:` — keep the alphabetical grouping already used there
members: tenantPath('/members'),
member: (userId: string) => tenantPath(`/members/${segment(userId)}`),
memberRoles: (userId: string) => tenantPath(`/members/${segment(userId)}/roles`),
invitations: tenantPath('/members/invitations'),
invitation: (invitationId: string) => tenantPath(`/members/invitations/${segment(invitationId)}`),
roles: tenantPath('/roles'),
rolesAssignable: tenantPath('/roles/assignable'),
role: (roleId: string) => tenantPath(`/roles/${segment(roleId)}`),
```

```ts
// paths.ts, inside `tenant:`
members: tenantPath('/members'),
membersSection: (section: string) => `${tenantPath('/members')}?section=${segment(section)}`,
memberInvite: tenantPath('/members/invite'),
member: (userId: string) => tenantPath(`/members/${segment(userId)}`),
roles: tenantPath('/roles'),
roleNew: tenantPath('/roles/new'),
roleEdit: (roleId: string) => tenantPath(`/roles/${segment(roleId)}/edit`),
```

and at the top level of `dashboardPaths` (it is not tenant-area-scoped — the recipient may not be a member yet):

```ts
invitationAccept: (token: string) => `/invitations/${segment(token)}`,
```

**Watch the two path modules.** `dashboardPaths` is where the browser goes; `apiPaths` is what a loader calls. They spell nearly the same strings here, so a swap compiles and runs — check what a value is *used as*.

- [ ] **Step 2: Write the permission label map**

```ts
// apps/dashboard/app/constants/permissions.ts
import type { TenantPermissionKey } from '@booking/contracts';

/** Vietnamese label per permission key. Keyed by the contracts enum, so a new
 *  key in the catalog fails typecheck here until it is given a label. */
export const TENANT_PERMISSION_LABELS: Record<TenantPermissionKey, string> = {
  'tenant.settings.manage': 'Quản lý cài đặt',
  'tenant.legal.manage': 'Quản lý pháp lý',
  'tenant.theme.manage': 'Tùy chỉnh giao diện',
  'tenant.partners.read': 'Xem đối tác',
  'tenant.partners.manage': 'Quản lý đối tác',
  'tenant.partners.approve': 'Duyệt đối tác',
  'tenant.listings.read': 'Xem tin đăng',
  'tenant.listings.write': 'Sửa tin đăng',
  'tenant.listings.publish': 'Duyệt và ẩn tin đăng',
  'tenant.bookings.read': 'Xem đặt chỗ',
  'tenant.bookings.manage': 'Quản lý đặt chỗ',
  'tenant.bookings.cancel': 'Hủy đặt chỗ',
  'tenant.commissions.manage': 'Quản lý hoa hồng',
  'tenant.promotions.manage': 'Quản lý khuyến mãi',
  'tenant.finance.read': 'Xem tài chính',
  'tenant.payouts.manage': 'Quản lý chi trả',
  'tenant.affiliates.manage': 'Quản lý cộng tác viên',
  'tenant.members.manage': 'Quản lý nhân sự',
  'tenant.roles.manage': 'Quản lý vai trò',
  'tenant.reports.read': 'Xem báo cáo',
  'tenant.reviews.read': 'Xem đánh giá',
  'tenant.favorites.read': 'Xem yêu thích',
  'tenant.disputes.read': 'Xem khiếu nại',
  'tenant.disputes.resolve': 'Xử lý khiếu nại',
};

/** Display order for the tick grid and the effective-permission preview. */
export const TENANT_PERMISSION_GROUPS: { label: string; keys: TenantPermissionKey[] }[] = [
  { label: 'Danh mục', keys: ['tenant.listings.read', 'tenant.listings.write', 'tenant.listings.publish'] },
  { label: 'Vận hành', keys: ['tenant.bookings.read', 'tenant.bookings.manage', 'tenant.bookings.cancel', 'tenant.partners.read', 'tenant.partners.manage', 'tenant.partners.approve', 'tenant.reviews.read', 'tenant.favorites.read'] },
  { label: 'Tài chính', keys: ['tenant.finance.read', 'tenant.payouts.manage', 'tenant.commissions.manage', 'tenant.reports.read', 'tenant.disputes.read', 'tenant.disputes.resolve'] },
  { label: 'Tiếp thị', keys: ['tenant.promotions.manage', 'tenant.affiliates.manage'] },
  { label: 'Hệ thống', keys: ['tenant.settings.manage', 'tenant.theme.manage', 'tenant.legal.manage', 'tenant.members.manage', 'tenant.roles.manage'] },
];
```

- [ ] **Step 3: Write the loader and action modules**

`loadTenantMembers(request)` calls `requireTenant(request)` with **no** permission argument — `tenant.members.manage` and `tenant.roles.manage` gate two independent halves of the screen, so requiring the former up front would 403 a caller who holds only the latter before they ever reach the "Vai trò" tab. It evaluates both `can('tenant.members.manage')`/`can('tenant.roles.manage')` itself, 403s only when NEITHER is held, fetches members/invitations only under the first and roles only under the second, and returns `{ members, invitations, roles, canManageMembers, canManageRoles }` — precomputed booleans, never the raw `can` function (React Router 8's single-fetch/turbo-stream wire format cannot encode a function; it silently decodes to `undefined` on the client, so `loaderData.can(...)` would throw post-hydration — matches `settings-loader.server.ts`'s `canTheme`/`canSettings`/… convention). `handleMembersAction` switches on an `intent` field (`invite`, `revoke-invitation`, `set-roles`, `remove-member`, `create-role`, `update-role`, `delete-role`), parses with the Task 1 zod schema, calls the API, and returns `routeData({ error, fieldErrors }, { status: 400 })` on failure — the shape `listing-types/new.tsx:23-35` uses.

- [ ] **Step 4: Verify**

```bash
pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/constants apps/dashboard/app/features/tenant/server
git commit -m "feat(dashboard): member and role data layer for the tenant area"
```

---

### Task 11: The `/tenant/members` screen

**Files:**
- Create: `apps/dashboard/app/routes/tenant/members/_index.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/members-table.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/invitations-table.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/roles-table.tsx`
- Modify: `apps/dashboard/app/routes/tenant/routes.ts`
- Modify: `apps/dashboard/app/routes/tenant/nav.ts`

**Interfaces:**
- Consumes: Task 10 loader/action and paths.
- Produces: the screen at `dashboardPaths.tenant.members` with `?section=members|invitations|roles`.

- [ ] **Step 1: Register the route and nav item**

```ts
// routes/tenant/routes.ts — beside the other entries
route('members', 'routes/tenant/members/_index.tsx'),
```

```ts
// routes/tenant/nav.ts — in the 'Hệ thống' section, before 'Cài đặt'
{
  title: 'Nhân sự',
  to: dashboardPaths.tenant.members,
  icon: UsersRound,
  anyPermissions: ['tenant.members.manage', 'tenant.roles.manage'],
},
```

Import `UsersRound` from `lucide-react`. `Users` is already taken by "Đối tác" — reusing it makes two different things look identical in the sidebar.

- [ ] **Step 2: Write the screen**

Three `Tabs` driven by `useSearchParams()`, exactly as `routes/tenant/settings.tsx` drives its sections. A tab is rendered **only** when its permission is held — the loader's precomputed `canManageMembers` for the first two, `canManageRoles` for the third (never a live `can(...)` call in the component — see Task 10's note on why the loader hands back booleans, not the function). Header actions: "Mời nhân sự" (links to `dashboardPaths.tenant.memberInvite`) and "Tạo vai trò" (`dashboardPaths.tenant.roleNew`), each gated the same way.

- [ ] **Step 3: Write the three tables**

Use `~/components/dashboard-data-table`. The members table shows avatar + name + email, **one chip per role** (multi-role is the normal case, not an edge case), and row actions "Sửa vai trò" / "Gỡ khỏi tenant". The remove action uses `~/components/confirm-button` — never a `window.confirm`, which would block the extension-driven browser check in Task 15.

The invitations table shows email, role chips, status badge, expiry, and "Thu hồi". Status colour comes from `~/components/status-badge` — that file is the one place a domain status becomes a colour.

The roles table shows name, system/custom, holder count, and "Sửa"/"Xóa" (both hidden for `isSystem`, replaced by "Nhân bản").

- [ ] **Step 4: Verify**

```bash
pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint && pnpm check:frontend-structure && pnpm check:theme-tokens
```

Then run `pnpm dev`, sign in at `admin.bookingstudio.localhost:5174` as `owner@bookingstudio.vn` / `demo-password`, and confirm: "Nhân sự" appears in the sidebar, all three tabs render, and the members table lists the owner with a `Tenant Owner` chip.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/routes/tenant apps/dashboard/app/features/tenant/components/members
git commit -m "feat(dashboard): tenant members screen with member, invitation and role tabs"
```

---

### Task 12: Invite and edit-member forms

**Files:**
- Create: `apps/dashboard/app/routes/tenant/members/invite.tsx`
- Create: `apps/dashboard/app/routes/tenant/members/detail.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/member-form.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/role-multi-select.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/permission-preview.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/inline-role-creator.tsx`
- Modify: `apps/dashboard/app/routes/tenant/routes.ts`

**Interfaces:**
- Consumes: Task 10 (`TENANT_PERMISSION_GROUPS`, paths, actions), Task 11 tables.
- Produces: `MemberForm` with prop `mode: 'invite' | 'edit'` — **one component, two modes**, never a second copy.

- [ ] **Step 1: Register the routes**

```ts
route('members/invite', 'routes/tenant/members/invite.tsx'),
route('members/:userId', 'routes/tenant/members/detail.tsx'),
```

- [ ] **Step 2: Write `role-multi-select.tsx` and `permission-preview.tsx`**

The multi-select holds `roleIds: string[]`, not a single id — this is the whole point of the multi-role support confirmed in the spec. The preview takes the selected roles' permission arrays, unions them, and renders them grouped by `TENANT_PERMISSION_GROUPS` with `TENANT_PERMISSION_LABELS`. It exists because two stacked roles are not something an owner can add up in their head.

- [ ] **Step 3: Write `inline-role-creator.tsx`**

A collapsible panel inside the form: role name + the 24-key tick grid. On submit it posts `intent=create-role` to the same action, and on success selects the new role in the multi-select. Rendered **only** when `can('tenant.roles.manage')`. This is what removes the "create a role before you can invite anyone" ordering problem.

- [ ] **Step 4: Write `member-form.tsx` and the two routes**

```tsx
<MemberForm
  mode="invite"          // 'edit' on detail.tsx
  roles={roles}
  canCreateRole={can('tenant.roles.manage')}
  serverError={actionData?.error ?? null}
  fieldErrors={actionData?.fieldErrors ?? null}
/>
```

Both routes wrap it in `FormPage` (`~/components/form-page`) with `backTo={dashboardPaths.tenant.members}`. `mode="edit"` hides the email field and pre-selects the member's current roles. Three sections, so a single `FormSurface` — **not** `FormWizard`.

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint && pnpm check:frontend-structure && pnpm check:theme-tokens
```

In the running app: invite `nhanvien@example.com` with two roles at once, confirm the preview lists the union of both, and confirm the invitation appears in the "Lời mời" tab.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/routes/tenant apps/dashboard/app/features/tenant/components/members
git commit -m "feat(dashboard): invite and edit member forms with inline role creation"
```

---

### Task 13: Role create and edit forms

**Files:**
- Create: `apps/dashboard/app/routes/tenant/roles/new.tsx`
- Create: `apps/dashboard/app/routes/tenant/roles/edit.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/role-form.tsx`
- Create: `apps/dashboard/app/features/tenant/components/members/permission-grid.tsx`
- Modify: `apps/dashboard/app/routes/tenant/routes.ts`

**Interfaces:**
- Consumes: Task 10 constants and actions; `createTenantRoleInputSchema` from Task 1.
- Produces: `PermissionGrid` (reused by `inline-role-creator.tsx` from Task 12 — extract it here and have Task 12's component import it rather than duplicating the grid).

- [ ] **Step 1: Register the routes**

```ts
route('roles/new', 'routes/tenant/roles/new.tsx'),
route('roles/:roleId/edit', 'routes/tenant/roles/edit.tsx'),
```

- [ ] **Step 2: Write `permission-grid.tsx`**

Checkbox grid grouped by `TENANT_PERMISSION_GROUPS`, each group with a "chọn tất cả" toggle. `readOnly` prop renders it disabled for a system role.

- [ ] **Step 3: Write `role-form.tsx` and both routes**

`FormPage` + `FormSurface`, using `GenericForm` with `createTenantRoleInputSchema`. The edit route loads the role first; if `isSystem`, it renders read-only with a "Nhân bản" button that navigates to `roleNew` with the permissions pre-filled.

- [ ] **Step 4: Verify**

```bash
pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint && pnpm check:frontend-structure && pnpm check:theme-tokens
```

In the app: create role "Lễ tân" with only `tenant.bookings.read`; confirm it appears in the roles tab with holder count 0; confirm "Tenant Owner" opens read-only.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/routes/tenant apps/dashboard/app/features/tenant/components/members
git commit -m "feat(dashboard): tenant role builder"
```

---

### Task 14: The accept-invitation screen

**Files:**
- Create: `apps/dashboard/app/routes/invitations/accept.tsx`
- Create: `apps/dashboard/app/features/tenant/server/invitation.server.ts`
- Modify: `apps/dashboard/app/routes.ts` (top-level, **not** `routes/tenant/routes.ts`)

**Interfaces:**
- Consumes: Task 8 endpoints, `dashboardPaths.invitationAccept`.
- Produces: the screen at `/invitations/:token`.

- [ ] **Step 1: Register at the top level**

```ts
// app/routes.ts — a sibling of the area layouts, NOT a child of the tenant layout
route('invitations/:token', 'routes/invitations/accept.tsx'),
```

`requireTenant` throws 403 for a caller with no membership (`features/tenant/server/tenant.server.ts:52-56`) — which is exactly the recipient's situation. Putting this route under `/tenant` would make the invitation unusable for everyone it is meant for.

- [ ] **Step 2: Write the loader**

Require a signed-in user only. If there is none, `redirect` to `/auth/login?redirectTo=/invitations/<token>`. Otherwise fetch the preview and return it.

- [ ] **Step 3: Write the screen — four states, each with its own copy**

| State | Copy |
| --- | --- |
| `pending` + `matchesCurrentUser` | "**{tenantName}** mời bạn tham gia với vai trò {roles}." + nút "Chấp nhận lời mời" |
| `pending` + mismatch | "Lời mời này gửi cho **{invitedEmail}**, nhưng bạn đang đăng nhập bằng **{currentEmail}**." + nút đăng xuất |
| `expired` | "Lời mời đã hết hạn. Hãy đề nghị {tenantName} gửi lại." |
| `revoked` / `accepted` | "Lời mời này không còn hiệu lực." |

Never auto-accept as the signed-in account on a mismatch.

- [ ] **Step 4: Write the action**

POST to the accept endpoint; on success `redirect(dashboardPaths.tenant.home)` — the user now has a tenant membership, so the tenant area will admit them.

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint && pnpm check:frontend-structure
```

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/routes apps/dashboard/app/features/tenant/server/invitation.server.ts
git commit -m "feat(dashboard): accept a tenant invitation"
```

---

### Task 15: Full verification and docs

**Files:**
- Modify: `tasks/phase-2-marketplace-depth/03-role-builder-ui.md` (tick the tenant-tier boxes, note partner/platform remain)
- Modify: `apps/dashboard/CLAUDE.md` (one line in *Constants* for `constants/permissions.ts`)

- [ ] **Step 1: Run the full static check**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Expected: every command exits 0. Run the **whole** line, not a subset — `check:theme-tokens` is the one most recently added and is easy to skip.

- [ ] **Step 2: Walk the end-to-end scenario in the real app**

```bash
docker compose up -d && pnpm dev
```

1. Sign in at `admin.bookingstudio.localhost:5174` as `owner@bookingstudio.vn` / `demo-password`.
2. Nhân sự → Vai trò → create "Lễ tân" with only `tenant.bookings.read`.
3. Nhân sự → "Mời nhân sự" → invite an address with no account, role "Lễ tân".
4. Open Mailpit (`localhost:8025`); confirm the CTA host-selection logic is correct — i.e. it matches
   the tenant's **primary verified dashboard domain** — not that it equals any particular literal. For
   the seeded BookingStudio that domain is `admin.bookingstudio.stg.bookingos.vn`, a staging host, even
   when the invite was sent from local dev: the seed registers both `admin.bookingstudio.stg.bookingos.vn`
   and `admin.bookingstudio.localhost` for the tenant but marks the staging one `is_primary` (see
   `apps/api/prisma/seed/tenants/booking-studio.ts:101-108`), and the CTA always resolves to the primary
   verified domain, so seeing the staging host here is correct, not a resolver bug to "fix".
5. Register that address through the storefront OTP flow. The mailed link itself does not resolve on a
   developer machine (it points at the staging host), so copy the token from the Mailpit link and open
   `http://admin.bookingstudio.localhost:5174/invitations/<token>` directly instead of clicking it.
6. Accept. Confirm the sidebar shows **only** "Đặt chỗ", and that visiting `/tenant/finance` returns 403.
7. As the owner, edit that member to hold **two** roles; confirm both chips render and the effective-permission preview shows the union.
8. Try to remove your own roles → expect `CANNOT_EDIT_SELF`.
9. Try to delete "Lễ tân" while someone holds it → expect `ROLE_IN_USE` with the count.
10. Remove the member, then confirm within a minute that they lose the tenant workspace.

- [ ] **Step 3: Update the ticket and docs**

Tick the tenant-tier scope boxes in `tasks/phase-2-marketplace-depth/03-role-builder-ui.md` and add a line saying the partner and platform tiers are still open. Add `permissions.ts` to the `constants/` list in `apps/dashboard/CLAUDE.md`.

- [ ] **Step 4: Commit and open the PR**

```bash
git add tasks apps/dashboard/CLAUDE.md
git commit -m "docs: tenant tier of the role-builder ticket is done"
git push -u origin feat/tenant-staff-rbac
gh pr create --title "feat: tenant staff management and role builder" --body "…"
```

---

## Risks

**The invitation-email CTA is only clickable end to end in an environment where the tenant's primary
dashboard domain actually resolves.** It resolves to whichever `tenant_domains` row is `is_primary AND
verified` (Task 9), and the seed marks the staging host primary for every tenant — so locally, and in
any environment where the primary domain isn't the one you're browsing from, the mailed link itself
will not load; that's a genuine property of the feature (a tenant's canonical host is its production
domain, not a dev convenience), not a local-setup quirk to route around.

## Notes for the implementer

**The single most likely defect in this feature is a missing `PermissionResolverService.invalidate(userId)`.** It fails silently: no throw, no log, just a member who keeps permissions they no longer have for up to 60 seconds. Every write path in Tasks 5–8 calls it. If you add another write path, call it there too.

**The second most likely is swapping `dashboardPaths` and `apiPaths`.** They spell nearly the same strings for this feature (`/tenant/members` both times). A swap compiles and runs; it just talks to the wrong place. Check what a value is used *as*.
