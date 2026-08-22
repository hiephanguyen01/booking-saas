import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IPartnerStaffRepository,
  PartnerStaffRow,
} from '../../domain/ports/partner-staff-repository.port';
import { ListPartnerMembersUseCase } from './list-partner-members.use-case';

const ROW: PartnerStaffRow = {
  userId: 'user-1',
  fullName: 'Giang',
  email: 'giang@giangstudio.vn',
  avatarUrl: null,
  roles: [{ id: 'role-owner', name: 'Partner Owner' }],
  permissions: ['partner.members.manage'],
  joinedAt: new Date('2026-01-15T08:30:00Z'),
  membershipMissing: false,
};

describe('ListPartnerMembersUseCase', () => {
  it('maps each member to the wire shape, with joinedAt as an ISO string', async () => {
    const tenantDb = fakeTenantDb();
    const asked: unknown[] = [];
    const useCase = new ListPartnerMembersUseCase(
      fakePort<IPartnerStaffRepository>({
        list: (_tx, tenantId, partnerId) => {
          asked.push({ tenantId, partnerId });
          return Promise.resolve([ROW]);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute('tenant-1', 'partner-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(asked).toEqual([{ tenantId: 'tenant-1', partnerId: 'partner-1' }]);
    expect(result).toEqual([
      {
        userId: 'user-1',
        fullName: 'Giang',
        email: 'giang@giangstudio.vn',
        avatarUrl: null,
        roles: [{ id: 'role-owner', name: 'Partner Owner' }],
        permissions: ['partner.members.manage'],
        joinedAt: '2026-01-15T08:30:00.000Z',
      },
    ]);
  });
});
