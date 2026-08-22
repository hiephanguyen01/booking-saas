import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IPartnerStaffRepository,
  PartnerRoleRow,
} from '../../domain/ports/partner-staff-repository.port';
import { ListAssignablePartnerRolesUseCase } from './list-assignable-partner-roles.use-case';

const ROWS: PartnerRoleRow[] = [
  {
    id: 'role-owner',
    name: 'Partner Owner',
    isSystem: true,
    permissions: ['partner.members.manage'],
  },
];

describe('ListAssignablePartnerRolesUseCase', () => {
  it('lists roles assignable in THIS partner, with their permission keys', async () => {
    // The role picker shows what each role grants, so the caller can see what
    // they are handing out before they hand it out.
    const tenantDb = fakeTenantDb();
    const asked: string[] = [];
    const useCase = new ListAssignablePartnerRolesUseCase(
      fakePort<IPartnerStaffRepository>({
        listAssignableRoles: (_tx, partnerId) => {
          asked.push(partnerId);
          return Promise.resolve(ROWS);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute('tenant-1', 'partner-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(asked).toEqual(['partner-1']);
    expect(result).toEqual([
      { id: 'role-owner', name: 'Partner Owner', permissions: ['partner.members.manage'] },
    ]);
  });
});
