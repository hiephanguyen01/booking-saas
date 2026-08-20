import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  RoleInUse,
  RoleNotFound,
  SystemRoleImmutable,
} from '../../domain/errors/tenant-access-errors';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { DeleteTenantRoleUseCase } from './delete-tenant-role.use-case';

const TENANT_ID = 'tenant-1';
const ROLE_ID = 'role-1';
const CTX = { userId: 'user-1' };

const role = (overrides: Partial<RoleRow> = {}): RoleRow => ({
  id: ROLE_ID,
  name: 'Lễ tân',
  isSystem: false,
  permissions: ['tenant.listing.approve'],
  memberCount: 0,
  ...overrides,
});

function harness(found: RoleRow | null = role()) {
  const deleted: Array<{ tenantId: string; roleId: string }> = [];
  const audits: AuditEntry[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DeleteTenantRoleUseCase(
      fakePort<ITenantRoleRepository>({
        findById: () => Promise.resolve(found),
        delete: (_tx, tenantId, roleId) => {
          deleted.push({ tenantId, roleId });
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
    deleted,
    audits,
  };
}

describe('DeleteTenantRoleUseCase', () => {
  it('answers not-found for a role this tenant does not have', async () => {
    const { useCase, deleted } = harness(null);

    await expect(useCase.execute(TENANT_ID, ROLE_ID, CTX)).rejects.toBeInstanceOf(RoleNotFound);
    expect(deleted).toEqual([]);
  });

  it('refuses to delete a SYSTEM role, which is shared across every tenant', async () => {
    const { useCase, deleted } = harness(role({ isSystem: true }));

    await expect(useCase.execute(TENANT_ID, ROLE_ID, CTX)).rejects.toBeInstanceOf(
      SystemRoleImmutable,
    );
    expect(deleted).toEqual([]);
  });

  it('REFUSES a role somebody still holds, and says how many', async () => {
    // The assignment FK cascades on delete, so an unguarded delete would strip
    // the role from every holder silently instead of failing loudly.
    const { useCase, deleted } = harness(role({ memberCount: 3 }));

    const error = await useCase
      .execute(TENANT_ID, ROLE_ID, CTX)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RoleInUse);
    expect((error as RoleInUse).details).toMatchObject({ memberCount: 3 });
    expect(deleted).toEqual([]);
  });

  it('refuses a role held by exactly ONE member', async () => {
    // The boundary is "anybody at all", not "more than one" — a single holder
    // still loses the role silently to the cascade.
    const { useCase, deleted } = harness(role({ memberCount: 1 }));

    await expect(useCase.execute(TENANT_ID, ROLE_ID, CTX)).rejects.toBeInstanceOf(RoleInUse);
    expect(deleted).toEqual([]);
  });

  it('deletes an unheld custom role and records who did it', async () => {
    const { useCase, deleted, audits, tenantDb } = harness();

    await useCase.execute(TENANT_ID, ROLE_ID, CTX);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([{ tenantId: TENANT_ID, roleId: ROLE_ID }]);
    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: 'user-1',
        action: 'role.deleted',
        entityType: 'role',
        entityId: ROLE_ID,
        data: { name: 'Lễ tân' },
      },
    ]);
  });
});
