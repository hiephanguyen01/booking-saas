import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { ListTenantRolesUseCase } from './list-tenant-roles.use-case';

const TENANT_ID = 'tenant-1';

const ROWS: RoleRow[] = [
  {
    id: 'role-system',
    name: 'Tenant Owner',
    isSystem: true,
    permissions: ['tenant.members.manage'],
    memberCount: 1,
  },
  {
    id: 'role-custom',
    name: 'Lễ tân',
    isSystem: false,
    permissions: ['tenant.listing.approve'],
    memberCount: 4,
  },
];

describe('ListTenantRolesUseCase', () => {
  it('returns each role with its full permission list, inside the tenant transaction', async () => {
    // The role-builder screen renders the permission checkboxes from this, so a
    // summary without the arrays would show every role as empty.
    const tenantDb = fakeTenantDb();
    const asked: string[] = [];
    const useCase = new ListTenantRolesUseCase(
      fakePort<ITenantRoleRepository>({
        list: (_tx, tenantId) => {
          asked.push(tenantId);
          return Promise.resolve(ROWS);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute(TENANT_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(asked).toEqual([TENANT_ID]);
    expect(result).toEqual([
      {
        id: 'role-system',
        name: 'Tenant Owner',
        isSystem: true,
        memberCount: 1,
        permissions: ['tenant.members.manage'],
      },
      {
        id: 'role-custom',
        name: 'Lễ tân',
        isSystem: false,
        memberCount: 4,
        permissions: ['tenant.listing.approve'],
      },
    ]);
  });
});
