import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { ListAssignableTenantRolesUseCase } from './list-assignable-tenant-roles.use-case';

const TENANT_ID = 'tenant-1';

const ROWS: RoleRow[] = [
  {
    id: 'role-system',
    name: 'Tenant Owner',
    isSystem: true,
    permissions: ['tenant.members.manage'],
    memberCount: 1,
  },
];

describe('ListAssignableTenantRolesUseCase', () => {
  it('trims each role to what a picker needs, dropping the permission arrays', async () => {
    // The invite form only needs {id, name}; shipping the permission sets to it
    // would put the tenant's whole access map into an ordinary form payload.
    const tenantDb = fakeTenantDb();
    const useCase = new ListAssignableTenantRolesUseCase(
      fakePort<ITenantRoleRepository>({ list: () => Promise.resolve(ROWS) }),
      tenantDb.service,
    );

    const result = await useCase.execute(TENANT_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toEqual([{ id: 'role-system', name: 'Tenant Owner' }]);
  });
});
