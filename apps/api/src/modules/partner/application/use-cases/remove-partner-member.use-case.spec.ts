import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  CannotEditSelf,
  LastManagerRemoved,
} from '../../../identity-access/domain/errors/tenant-access-errors';
import type { IPermissionResolver } from '../../../identity-access/domain/ports/permission-resolver.port';
import type {
  IPartnerStaffRepository,
  PartnerStaffRow,
} from '../../domain/ports/partner-staff-repository.port';
import { RemovePartnerMemberUseCase } from './remove-partner-member.use-case';

const SCOPE = { tenantId: 'tenant-1', partnerId: 'partner-1' };
const CALLER = 'user-caller';
const TARGET = 'user-target';
const CTX = { userId: CALLER };
const MANAGE = 'partner.members.manage';

const member = (userId: string, permissions: string[]): PartnerStaffRow => ({
  userId,
  fullName: userId,
  email: `${userId}@giangstudio.vn`,
  avatarUrl: null,
  roles: [],
  permissions,
  joinedAt: new Date('2026-01-01T00:00:00Z'),
  membershipMissing: false,
});

function harness(all: PartnerStaffRow[] = [member(CALLER, [MANAGE]), member(TARGET, [])]) {
  const removals: unknown[] = [];
  const audits: AuditEntry[] = [];
  const order: string[] = [];
  const tenantDb = fakeTenantDb({
    onOpen: () => order.push('openTransaction'),
    onClose: () => order.push('closeTransaction'),
  });
  return {
    useCase: new RemovePartnerMemberUseCase(
      fakePort<IPartnerStaffRepository>({
        list: () => Promise.resolve(all),
        removeStaff: (_tx, tenantId, partnerId, userId) => {
          removals.push({ tenantId, partnerId, userId });
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
    removals,
    audits,
    order,
  };
}

describe('RemovePartnerMemberUseCase', () => {
  it('refuses to remove YOURSELF', async () => {
    const { useCase, tenantDb } = harness();

    await expect(useCase.execute(SCOPE, CALLER, CTX)).rejects.toBeInstanceOf(CannotEditSelf);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('REFUSES to remove the last person who can manage partner staff', async () => {
    const { useCase, removals } = harness([member(TARGET, [MANAGE])]);

    await expect(useCase.execute(SCOPE, TARGET, CTX)).rejects.toBeInstanceOf(LastManagerRemoved);
    expect(removals).toEqual([]);
  });

  it('checks the lockout with the target already filtered OUT', async () => {
    const { useCase, removals } = harness([member(TARGET, [MANAGE]), member('user-3', [MANAGE])]);

    await useCase.execute(SCOPE, TARGET, CTX);

    expect(removals).toEqual([{ ...SCOPE, userId: TARGET }]);
  });

  it('removes the membership AND the assignments in lockstep', async () => {
    // Leaving one behind is exactly the `membershipMissing` state the repository
    // flags as a bug.
    const { useCase, removals, audits } = harness();

    await useCase.execute(SCOPE, TARGET, CTX);

    expect(removals).toEqual([{ ...SCOPE, userId: TARGET }]);
    expect(audits).toEqual([
      {
        tenantId: SCOPE.tenantId,
        actorUserId: CALLER,
        action: 'partner_member.removed',
        entityType: 'user',
        entityId: TARGET,
        data: { partnerId: SCOPE.partnerId },
      },
    ]);
  });

  it('drops the cached permissions after the transaction closes', async () => {
    const { useCase, order } = harness();

    await useCase.execute(SCOPE, TARGET, CTX);

    expect(order.at(-1)).toBe(`invalidate:${TARGET}`);
    expect(order.at(-2)).toBe('closeTransaction');
  });
});
