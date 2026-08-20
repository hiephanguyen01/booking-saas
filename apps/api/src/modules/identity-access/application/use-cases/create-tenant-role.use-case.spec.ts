import { describe, expect, it } from 'vitest';
import type { CreateTenantRoleInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { PermissionEscalation } from '../../domain/errors/tenant-access-errors';
import type { IPermissionResolver } from '../../domain/ports/permission-resolver.port';
import type { ITenantRoleRepository } from '../../domain/ports/tenant-role-repository.port';
import { CreateTenantRoleUseCase } from './create-tenant-role.use-case';

const TENANT_ID = 'tenant-1';
const CTX = { userId: 'user-1' };

function harness(callerHolds: string[]) {
  const created: Array<{ tenantId: string; name: string; permissions: readonly string[] }> = [];
  const audits: AuditEntry[] = [];
  const scopes: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new CreateTenantRoleUseCase(
      fakePort<ITenantRoleRepository>({
        create: (_tx, tenantId, name, permissions) => {
          created.push({ tenantId, name, permissions });
          return Promise.resolve('role-new');
        },
      }),
      fakePort<IPermissionResolver>({
        resolve: (_userId, scope) => {
          scopes.push(scope);
          return Promise.resolve(new Set(callerHolds));
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
    created,
    audits,
    scopes,
  };
}

const input = (permissions: string[]): CreateTenantRoleInput =>
  ({ name: 'Lễ tân', permissions }) as CreateTenantRoleInput;

describe('CreateTenantRoleUseCase', () => {
  it('refuses to mint a role STRONGER than the caller, naming the excess keys', async () => {
    // Silently trimming would hand back a role that is not what was asked for,
    // and nobody would learn it is weaker than the screen showed.
    const { useCase, created } = harness(['tenant.listing.approve']);

    const error = await useCase
      .execute(TENANT_ID, input(['tenant.listing.approve', 'tenant.members.manage']), CTX)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PermissionEscalation);
    expect((error as PermissionEscalation).details).toMatchObject({
      keys: ['tenant.members.manage'],
    });
    expect(created).toEqual([]);
  });

  it('opens NO transaction for a refused escalation', async () => {
    const { useCase, tenantDb } = harness([]);

    await expect(
      useCase.execute(TENANT_ID, input(['tenant.members.manage']), CTX),
    ).rejects.toBeInstanceOf(PermissionEscalation);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it("resolves the caller's permissions within THIS tenant", async () => {
    // A platform-wide resolve would let a permission held in another tenant
    // authorise a role here.
    const { useCase, scopes } = harness(['tenant.listing.approve']);

    await useCase.execute(TENANT_ID, input(['tenant.listing.approve']), CTX);

    expect(scopes).toEqual([{ tenantId: TENANT_ID }]);
  });

  it('creates a role holding exactly the requested permissions', async () => {
    const { useCase, created, tenantDb } = harness([
      'tenant.listing.approve',
      'tenant.members.manage',
    ]);

    const result = await useCase.execute(
      TENANT_ID,
      input(['tenant.listing.approve']),
      CTX,
    );

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created).toEqual([
      { tenantId: TENANT_ID, name: 'Lễ tân', permissions: ['tenant.listing.approve'] },
    ]);
    expect(result).toEqual({ id: 'role-new' });
  });

  it('accepts an EMPTY permission set — a role with nothing granted is legitimate', async () => {
    const { useCase, created } = harness([]);

    await useCase.execute(TENANT_ID, input([]), CTX);

    expect(created).toHaveLength(1);
  });

  it('records who minted the role and what it grants', async () => {
    // The audit row is the only place the granted set is recoverable after a
    // later edit replaces it.
    const { useCase, audits } = harness(['tenant.listing.approve']);

    await useCase.execute(TENANT_ID, input(['tenant.listing.approve']), CTX);

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: 'user-1',
        action: 'role.created',
        entityType: 'role',
        entityId: 'role-new',
        data: { name: 'Lễ tân', permissions: ['tenant.listing.approve'] },
      },
    ]);
  });
});
