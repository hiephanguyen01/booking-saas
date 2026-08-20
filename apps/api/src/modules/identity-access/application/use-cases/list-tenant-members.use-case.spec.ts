import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  ITenantMemberRepository,
  MemberRow,
} from '../../domain/ports/tenant-member-repository.port';
import { ListTenantMembersUseCase } from './list-tenant-members.use-case';

const ROW: MemberRow = {
  userId: 'user-1',
  fullName: 'Chủ StudioHub',
  email: 'owner@studiohub.vn',
  avatarUrl: null,
  roles: [{ id: 'role-owner', name: 'Tenant Owner' }],
  permissions: ['tenant.members.manage'],
  joinedAt: new Date('2026-01-15T08:30:00Z'),
};

describe('ListTenantMembersUseCase', () => {
  it('maps each member to the wire shape, with joinedAt as an ISO string', async () => {
    // A `Date` would serialise differently depending on who does it; the
    // contract fixes one representation.
    const tenantDb = fakeTenantDb();
    const asked: string[] = [];
    const useCase = new ListTenantMembersUseCase(
      fakePort<ITenantMemberRepository>({
        list: (_tx, tenantId) => {
          asked.push(tenantId);
          return Promise.resolve([ROW]);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute('tenant-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(asked).toEqual(['tenant-1']);
    expect(result).toEqual([
      {
        userId: 'user-1',
        fullName: 'Chủ StudioHub',
        email: 'owner@studiohub.vn',
        avatarUrl: null,
        roles: [{ id: 'role-owner', name: 'Tenant Owner' }],
        permissions: ['tenant.members.manage'],
        joinedAt: '2026-01-15T08:30:00.000Z',
      },
    ]);
  });
});
