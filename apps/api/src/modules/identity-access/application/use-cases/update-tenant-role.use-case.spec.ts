import { describe, expect, it } from 'vitest';
import type { UpdateTenantRoleInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  LastManagerRemoved,
  PermissionEscalation,
  RoleNotFound,
  SystemRoleImmutable,
} from '../../domain/errors/tenant-access-errors';
import type { IPermissionResolver } from '../../domain/ports/permission-resolver.port';
import type {
  ITenantMemberRepository,
  MemberRow,
} from '../../domain/ports/tenant-member-repository.port';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { UpdateTenantRoleUseCase } from './update-tenant-role.use-case';

const TENANT_ID = 'tenant-1';
const ROLE_ID = 'role-custom';
const CTX = { userId: 'user-1' };
const MANAGE = 'tenant.members.manage';
const APPROVE = 'tenant.listing.approve';

const role = (overrides: Partial<RoleRow> = {}): RoleRow => ({
  id: ROLE_ID,
  name: 'Lễ tân',
  isSystem: false,
  permissions: [MANAGE],
  memberCount: 1,
  ...overrides,
});

const member = (userId: string, roleIds: string[]): MemberRow =>
  ({
    userId,
    fullName: userId,
    email: `${userId}@studiohub.vn`,
    avatarUrl: null,
    roles: roleIds.map((id) => ({ id, name: id })),
    permissions: [],
    joinedAt: new Date('2026-01-01T00:00:00Z'),
  }) as MemberRow;

interface Options {
  callerHolds?: string[];
  found?: RoleRow | null;
  allRoles?: RoleRow[];
  members?: MemberRow[];
  holders?: string[];
  /** `false` makes the tenant-scoped write match nothing, as a concurrent delete would. */
  updateResult?: boolean;
}

function harness(options: Options = {}) {
  const updates: Array<{ roleId: string; name: string; permissions: readonly string[] }> = [];
  const audits: AuditEntry[] = [];
  const invalidated: string[] = [];
  const order: string[] = [];
  const tenantDb = fakeTenantDb({
    onOpen: () => order.push('openTransaction'),
    onClose: () => order.push('closeTransaction'),
  });
  return {
    useCase: new UpdateTenantRoleUseCase(
      fakePort<ITenantRoleRepository>({
        findById: () => Promise.resolve(options.found === undefined ? role() : options.found),
        list: () => Promise.resolve(options.allRoles ?? [role()]),
        update: (_tx, _tenantId, roleId, name, permissions) => {
          updates.push({ roleId, name, permissions });
          return Promise.resolve(options.updateResult ?? true);
        },
      }),
      fakePort<ITenantMemberRepository>({
        list: () => Promise.resolve(options.members ?? [member('user-1', [ROLE_ID])]),
        holdersOfRole: () => {
          order.push('holdersOfRole');
          return Promise.resolve(options.holders ?? ['user-2', 'user-3']);
        },
      }),
      fakePort<IPermissionResolver>({
        resolve: () => Promise.resolve(new Set(options.callerHolds ?? [MANAGE, APPROVE])),
        invalidate: (userId) => {
          order.push(`invalidate:${userId}`);
          invalidated.push(userId);
          return Promise.resolve();
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          order.push('audit');
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    updates,
    audits,
    invalidated,
    order,
  };
}

const input = (permissions: string[], name = 'Lễ tân') =>
  ({ name, permissions }) as UpdateTenantRoleInput;

describe('UpdateTenantRoleUseCase', () => {
  it('refuses an edit that hands the role permissions the caller lacks', async () => {
    // Otherwise an edit is just a slower way to mint a stronger role.
    const { useCase, updates, tenantDb } = harness({ callerHolds: [APPROVE] });

    await expect(
      useCase.execute(TENANT_ID, ROLE_ID, input([APPROVE, MANAGE]), CTX),
    ).rejects.toBeInstanceOf(PermissionEscalation);
    expect(updates).toEqual([]);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('answers not-found for a role this tenant does not have', async () => {
    const { useCase, updates } = harness({ found: null });

    await expect(
      useCase.execute(TENANT_ID, ROLE_ID, input([MANAGE]), CTX),
    ).rejects.toBeInstanceOf(RoleNotFound);
    expect(updates).toEqual([]);
  });

  it('refuses to edit a system role, which every tenant shares', async () => {
    const { useCase, updates } = harness({ found: role({ isSystem: true }) });

    await expect(
      useCase.execute(TENANT_ID, ROLE_ID, input([MANAGE]), CTX),
    ).rejects.toBeInstanceOf(SystemRoleImmutable);
    expect(updates).toEqual([]);
  });

  it('REFUSES an edit that would leave the tenant with nobody able to manage members', async () => {
    // Stripping the manage key from the only role that carries it strands the
    // tenant exactly as removing its last manager would.
    const { useCase, updates } = harness({
      allRoles: [role({ permissions: [MANAGE] })],
      members: [member('user-1', [ROLE_ID])],
    });

    await expect(
      useCase.execute(TENANT_ID, ROLE_ID, input([APPROVE]), CTX),
    ).rejects.toBeInstanceOf(LastManagerRemoved);
    expect(updates).toEqual([]);
  });

  it('checks the lockout against the permissions AS THEY WOULD BE after the edit', async () => {
    // The stored role still carries the key at this point; testing the stored
    // set would let every such edit through.
    const { useCase, updates } = harness({
      allRoles: [
        role({ permissions: [MANAGE] }),
        { id: 'role-other', name: 'Quản lý', isSystem: false, permissions: [MANAGE], memberCount: 1 },
      ],
      members: [member('user-1', [ROLE_ID]), member('user-2', ['role-other'])],
    });

    await useCase.execute(TENANT_ID, ROLE_ID, input([APPROVE]), CTX);

    expect(updates).toHaveLength(1);
  });

  it('lets someone edit a role THEY hold — there is no self-edit ban', async () => {
    // Editing your own role is what an owner does; the lockout check is the
    // right guard, and a self-edit ban would block legitimate work.
    const { useCase, updates } = harness({
      allRoles: [role({ permissions: [MANAGE, APPROVE] })],
      members: [member('user-1', [ROLE_ID])],
    });

    await useCase.execute(TENANT_ID, ROLE_ID, input([MANAGE]), CTX);

    expect(updates).toHaveLength(1);
  });

  it('unions the permissions of a member holding several roles', async () => {
    // A member keeps the manage key through another role, so this edit is safe.
    const { useCase, updates } = harness({
      allRoles: [
        role({ permissions: [MANAGE] }),
        { id: 'role-b', name: 'Kế toán', isSystem: false, permissions: [MANAGE], memberCount: 1 },
      ],
      members: [member('user-1', [ROLE_ID, 'role-b'])],
    });

    await useCase.execute(TENANT_ID, ROLE_ID, input([APPROVE]), CTX);

    expect(updates).toHaveLength(1);
  });

  it('writes the new name and the WHOLE permission set', async () => {
    const { useCase, updates } = harness();

    await useCase.execute(TENANT_ID, ROLE_ID, input([MANAGE, APPROVE], 'Quản lý mới'), CTX);

    expect(updates).toEqual([
      { roleId: ROLE_ID, name: 'Quản lý mới', permissions: [MANAGE, APPROVE] },
    ]);
  });

  it('trusts the tenant-scoped write over the earlier read', async () => {
    // `role_permissions` has no tenant_id and no RLS policy of its own, so the
    // match inside `update()` is the only thing gating the write — a stale
    // `findById` must not be allowed to report success.
    const { useCase, audits } = harness({ updateResult: false });

    await expect(
      useCase.execute(TENANT_ID, ROLE_ID, input([MANAGE]), CTX),
    ).rejects.toBeInstanceOf(RoleNotFound);
    expect(audits).toEqual([]);
  });

  it('drops the cached permissions of every holder', async () => {
    // The resolver caches for a minute; without this the holders keep exercising
    // the permissions this edit just took away.
    const { useCase, invalidated } = harness({ holders: ['user-2', 'user-3'] });

    await useCase.execute(TENANT_ID, ROLE_ID, input([MANAGE]), CTX);

    expect(invalidated).toEqual(['user-2', 'user-3']);
  });

  it('invalidates AFTER the transaction, never inside it', async () => {
    // Invalidating inside would let a concurrent request refill the cache with
    // the permission set this write is replacing, before it commits.
    const { useCase, order } = harness({ holders: ['user-2'] });

    await useCase.execute(TENANT_ID, ROLE_ID, input([MANAGE]), CTX);

    expect(order).toEqual([
      'openTransaction',
      'audit',
      'holdersOfRole',
      'closeTransaction',
      'invalidate:user-2',
    ]);
  });

  it('records the edit with the set it wrote', async () => {
    const { useCase, audits } = harness();

    await useCase.execute(TENANT_ID, ROLE_ID, input([MANAGE], 'Quản lý mới'), CTX);

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: 'user-1',
        action: 'role.updated',
        entityType: 'role',
        entityId: ROLE_ID,
        data: { name: 'Quản lý mới', permissions: [MANAGE] },
      },
    ]);
  });
});
