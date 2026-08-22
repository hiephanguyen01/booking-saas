import { describe, expect, it } from 'vitest';
import type { SetTenantMemberRolesInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  CannotEditSelf,
  LastManagerRemoved,
  MemberNotFound,
  PermissionEscalation,
  RoleNotFound,
} from '../../domain/errors/tenant-access-errors';
import type { IPermissionResolver } from '../../domain/ports/permission-resolver.port';
import type {
  ITenantMemberRepository,
  MemberRow,
} from '../../domain/ports/tenant-member-repository.port';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { SetTenantMemberRolesUseCase } from './set-tenant-member-roles.use-case';

const TENANT_ID = 'tenant-1';
const CALLER = 'user-caller';
const TARGET = 'user-target';
const CTX = { userId: CALLER };
const MANAGE = 'tenant.members.manage';
const APPROVE = 'tenant.listing.approve';

const role = (id: string, permissions: string[]): RoleRow => ({
  id,
  name: id,
  isSystem: false,
  permissions,
  memberCount: 1,
});

const member = (userId: string, roleIds: string[], permissions: string[]): MemberRow =>
  ({
    userId,
    fullName: userId,
    email: `${userId}@studiohub.vn`,
    avatarUrl: null,
    roles: roleIds.map((id) => ({ id, name: id })),
    permissions,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
  }) as MemberRow;

interface Options {
  callerHolds?: string[];
  target?: MemberRow | null;
  assignable?: RoleRow[];
  all?: MemberRow[];
}

function harness(options: Options = {}) {
  const added: Array<{ userId: string; roleIds: readonly string[] }> = [];
  const removed: Array<{ userId: string; roleIds: readonly string[] }> = [];
  const audits: AuditEntry[] = [];
  const order: string[] = [];
  const tenantDb = fakeTenantDb({
    onOpen: () => order.push('openTransaction'),
    onClose: () => order.push('closeTransaction'),
  });
  return {
    useCase: new SetTenantMemberRolesUseCase(
      fakePort<ITenantMemberRepository>({
        findOne: () =>
          Promise.resolve(
            options.target === undefined ? member(TARGET, ['role-a'], [APPROVE]) : options.target,
          ),
        list: () =>
          Promise.resolve(
            options.all ?? [
              member(CALLER, ['role-owner'], [MANAGE]),
              member(TARGET, ['role-a'], [APPROVE]),
            ],
          ),
        addRoles: (_tx, _tenantId, userId, roleIds) => {
          order.push('addRoles');
          added.push({ userId, roleIds });
          return Promise.resolve();
        },
        removeRoles: (_tx, _tenantId, userId, roleIds) => {
          order.push('removeRoles');
          removed.push({ userId, roleIds });
          return Promise.resolve();
        },
      }),
      fakePort<ITenantRoleRepository>({
        filterAssignable: () =>
          Promise.resolve(options.assignable ?? [role('role-b', [APPROVE])]),
      }),
      fakePort<IPermissionResolver>({
        resolve: () => Promise.resolve(new Set(options.callerHolds ?? [MANAGE, APPROVE])),
        invalidate: (userId) => {
          order.push(`invalidate:${userId}`);
          return Promise.resolve();
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    added,
    removed,
    audits,
    order,
  };
}

const input = (roleIds: string[]) => ({ roleIds }) as SetTenantMemberRolesInput;

describe('SetTenantMemberRolesUseCase', () => {
  it('refuses to edit YOUR OWN roles', async () => {
    // Demotion goes through someone else, so a mis-click cannot strand the
    // tenant.
    const { useCase, tenantDb } = harness();

    await expect(
      useCase.execute(TENANT_ID, CALLER, input(['role-b']), CTX),
    ).rejects.toBeInstanceOf(CannotEditSelf);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('answers not-found for someone who is not a member of this tenant', async () => {
    const { useCase, added } = harness({ target: null });

    await expect(
      useCase.execute(TENANT_ID, TARGET, input(['role-b']), CTX),
    ).rejects.toBeInstanceOf(MemberNotFound);
    expect(added).toEqual([]);
  });

  it("refuses a role id that is not assignable in THIS tenant", async () => {
    // `filterAssignable` returning fewer rows than were asked for means at least
    // one id belongs to another tenant, or to nothing at all.
    const { useCase, added } = harness({ assignable: [role('role-b', [APPROVE])] });

    await expect(
      useCase.execute(TENANT_ID, TARGET, input(['role-b', 'role-elsewhere']), CTX),
    ).rejects.toBeInstanceOf(RoleNotFound);
    expect(added).toEqual([]);
  });

  it('refuses to grant a role carrying permissions the caller lacks', async () => {
    // Otherwise a manager could promote someone past themselves.
    const { useCase, added } = harness({
      callerHolds: [APPROVE],
      assignable: [role('role-b', [MANAGE])],
    });

    await expect(
      useCase.execute(TENANT_ID, TARGET, input(['role-b']), CTX),
    ).rejects.toBeInstanceOf(PermissionEscalation);
    expect(added).toEqual([]);
  });

  it('REFUSES a demotion that leaves nobody able to manage members', async () => {
    const { useCase, added } = harness({
      all: [member(TARGET, ['role-owner'], [MANAGE])],
      assignable: [role('role-b', [APPROVE])],
    });

    await expect(
      useCase.execute(TENANT_ID, TARGET, input(['role-b']), CTX),
    ).rejects.toBeInstanceOf(LastManagerRemoved);
    expect(added).toEqual([]);
  });

  it("checks the lockout against the target's NEW permissions", async () => {
    // The stored row still carries the old set at this point; checking that
    // would let every demotion of the last manager through.
    const { useCase, added } = harness({
      all: [member(TARGET, ['role-owner'], [MANAGE])],
      assignable: [role('role-b', [MANAGE])],
    });

    await useCase.execute(TENANT_ID, TARGET, input(['role-b']), CTX);

    expect(added).toHaveLength(1);
  });

  it('DIFFS the requested set against what the member already holds', async () => {
    // Sending the whole target state must not re-add roles they already have,
    // which would churn assignment rows on every save.
    const { useCase, added, removed } = harness({
      target: member(TARGET, ['role-a', 'role-b'], [APPROVE]),
      assignable: [role('role-b', [APPROVE]), role('role-c', [APPROVE])],
    });

    await useCase.execute(TENANT_ID, TARGET, input(['role-b', 'role-c']), CTX);

    expect(removed).toEqual([{ userId: TARGET, roleIds: ['role-a'] }]);
    expect(added).toEqual([{ userId: TARGET, roleIds: ['role-c'] }]);
  });

  it('touches nothing when the requested set is what they already hold', async () => {
    const { useCase, added, removed } = harness({
      target: member(TARGET, ['role-b'], [APPROVE]),
      assignable: [role('role-b', [APPROVE])],
    });

    await useCase.execute(TENANT_ID, TARGET, input(['role-b']), CTX);

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('REMOVES before adding', async () => {
    // A unique constraint on (user, role, scope) makes the order matter when a
    // save both drops and re-adds around the same rows.
    const { useCase, order } = harness({
      target: member(TARGET, ['role-a'], [APPROVE]),
      assignable: [role('role-b', [APPROVE])],
    });

    await useCase.execute(TENANT_ID, TARGET, input(['role-b']), CTX);

    expect(order.indexOf('removeRoles')).toBeLessThan(order.indexOf('addRoles'));
  });

  it('drops the cached permissions AFTER the transaction closes', async () => {
    // Skipping it leaves the member acting on the old set for up to a minute;
    // doing it inside lets a concurrent request refill the cache pre-commit.
    const { useCase, order } = harness({
      target: member(TARGET, ['role-a'], [APPROVE]),
      assignable: [role('role-b', [APPROVE])],
    });

    await useCase.execute(TENANT_ID, TARGET, input(['role-b']), CTX);

    expect(order.at(-1)).toBe(`invalidate:${TARGET}`);
    expect(order.at(-2)).toBe('closeTransaction');
  });

  it('records what moved, not just that something did', async () => {
    const { useCase, audits } = harness({
      target: member(TARGET, ['role-a'], [APPROVE]),
      assignable: [role('role-b', [APPROVE])],
    });

    await useCase.execute(TENANT_ID, TARGET, input(['role-b']), CTX);

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: CALLER,
        action: 'member.roles_changed',
        entityType: 'user',
        entityId: TARGET,
        data: { added: ['role-b'], removed: ['role-a'] },
      },
    ]);
  });
});
