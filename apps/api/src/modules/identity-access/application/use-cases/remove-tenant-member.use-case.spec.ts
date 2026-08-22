import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { CannotEditSelf, LastManagerRemoved } from '../../domain/errors/tenant-access-errors';
import type { IPermissionResolver } from '../../domain/ports/permission-resolver.port';
import type {
  ITenantMemberRepository,
  MemberRow,
} from '../../domain/ports/tenant-member-repository.port';
import { RemoveTenantMemberUseCase } from './remove-tenant-member.use-case';

const TENANT_ID = 'tenant-1';
const CALLER = 'user-caller';
const TARGET = 'user-target';
const CTX = { userId: CALLER };
const MANAGE = 'tenant.members.manage';

const member = (userId: string, permissions: string[]): MemberRow =>
  ({
    userId,
    fullName: userId,
    email: `${userId}@studiohub.vn`,
    avatarUrl: null,
    roles: [],
    permissions,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
  }) as MemberRow;

function harness(all: MemberRow[] = [member(CALLER, [MANAGE]), member(TARGET, [])]) {
  const removed: Array<{ tenantId: string; userId: string }> = [];
  const audits: AuditEntry[] = [];
  const order: string[] = [];
  const tenantDb = fakeTenantDb({
    onOpen: () => order.push('openTransaction'),
    onClose: () => order.push('closeTransaction'),
  });
  return {
    useCase: new RemoveTenantMemberUseCase(
      fakePort<ITenantMemberRepository>({
        list: () => Promise.resolve(all),
        removeAll: (_tx, tenantId, userId) => {
          order.push('removeAll');
          removed.push({ tenantId, userId });
          return Promise.resolve();
        },
      }),
      fakePort<IPermissionResolver>({
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
    removed,
    audits,
    order,
  };
}

describe('RemoveTenantMemberUseCase', () => {
  it('refuses to remove YOURSELF', async () => {
    const { useCase, tenantDb } = harness();

    await expect(useCase.execute(TENANT_ID, CALLER, CTX)).rejects.toBeInstanceOf(CannotEditSelf);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('REFUSES to remove the last member who can manage members', async () => {
    // The tenant would be left unable to invite anyone back in.
    const { useCase, removed } = harness([member(TARGET, [MANAGE])]);

    await expect(useCase.execute(TENANT_ID, TARGET, CTX)).rejects.toBeInstanceOf(
      LastManagerRemoved,
    );
    expect(removed).toEqual([]);
  });

  it('checks the lockout with the target already filtered OUT', async () => {
    // Checking the membership as it stands would count the manager being
    // removed, and every such removal would pass.
    const { useCase, removed } = harness([member(TARGET, [MANAGE]), member('user-3', [MANAGE])]);

    await useCase.execute(TENANT_ID, TARGET, CTX);

    expect(removed).toEqual([{ tenantId: TENANT_ID, userId: TARGET }]);
  });

  it('deletes every tenant-scoped assignment the member held', async () => {
    const { useCase, removed } = harness();

    await useCase.execute(TENANT_ID, TARGET, CTX);

    expect(removed).toEqual([{ tenantId: TENANT_ID, userId: TARGET }]);
  });

  it('drops the cached permissions after the transaction closes', async () => {
    const { useCase, order } = harness();

    await useCase.execute(TENANT_ID, TARGET, CTX);

    expect(order.at(-1)).toBe(`invalidate:${TARGET}`);
    expect(order.at(-2)).toBe('closeTransaction');
  });

  it('records who removed whom', async () => {
    const { useCase, audits } = harness();

    await useCase.execute(TENANT_ID, TARGET, CTX);

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: CALLER,
        action: 'member.removed',
        entityType: 'user',
        entityId: TARGET,
      },
    ]);
  });
});
