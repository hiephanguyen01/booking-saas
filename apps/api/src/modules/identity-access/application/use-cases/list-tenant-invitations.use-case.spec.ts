import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  InvitationRow,
  ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { ListTenantInvitationsUseCase } from './list-tenant-invitations.use-case';

const TENANT_ID = 'tenant-1';

const row = (overrides: Partial<InvitationRow> = {}): InvitationRow => ({
  id: 'invitation-1',
  tenantId: TENANT_ID,
  tenantName: 'StudioHub',
  partnerId: null,
  partnerName: null,
  email: 'moi@studiohub.vn',
  roleIds: ['role-a'],
  status: 'pending',
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  invitedByName: 'Chủ StudioHub',
  ...overrides,
});

const ROLES: RoleRow[] = [
  { id: 'role-a', name: 'Lễ tân', isSystem: false, permissions: [], memberCount: 0 },
];

function harness(rows: InvitationRow[]) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListTenantInvitationsUseCase(
      fakePort<ITenantInvitationRepository>({ list: () => Promise.resolve(rows) }),
      fakePort<ITenantRoleRepository>({ list: () => Promise.resolve(ROLES) }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('ListTenantInvitationsUseCase', () => {
  it('HIDES partner-scope rows, which share this tenant id', async () => {
    // They would show as ghost entries whose role names never resolve, because
    // partner roles are not in this tenant's role list.
    const { useCase } = harness([row(), row({ id: 'invitation-2', partnerId: 'partner-1' })]);

    const result = await useCase.execute(TENANT_ID);

    expect(result.map((r) => r.id)).toEqual(['invitation-1']);
  });

  it('DERIVES the expired state from the clock rather than reading a column', async () => {
    // Nothing writes `expired`; a pending row simply stops being pending once
    // its deadline passes.
    const { useCase } = harness([
      row({ id: 'fresh', expiresAt: new Date(Date.now() + 60_000) }),
      row({ id: 'stale', expiresAt: new Date(Date.now() - 60_000) }),
    ]);

    const result = await useCase.execute(TENANT_ID);

    expect(result.map((r) => [r.id, r.status])).toEqual([
      ['fresh', 'pending'],
      ['stale', 'expired'],
    ]);
  });

  it('leaves an accepted or revoked row alone even when its deadline has passed', async () => {
    const { useCase } = harness([
      row({ id: 'accepted', status: 'accepted', expiresAt: new Date(Date.now() - 60_000) }),
      row({ id: 'revoked', status: 'revoked', expiresAt: new Date(Date.now() - 60_000) }),
    ]);

    const result = await useCase.execute(TENANT_ID);

    expect(result.map((r) => r.status)).toEqual(['accepted', 'revoked']);
  });

  it('resolves role names, dropping a role deleted since the invite was sent', async () => {
    const { useCase } = harness([row({ roleIds: ['role-a', 'role-gone'] })]);

    const result = await useCase.execute(TENANT_ID);

    expect(result[0]?.roles).toEqual([{ id: 'role-a', name: 'Lễ tân' }]);
  });

  it('renders the timestamps as ISO strings', async () => {
    const { useCase, tenantDb } = harness([
      row({
        expiresAt: new Date('2026-09-01T00:00:00Z'),
        createdAt: new Date('2026-08-01T00:00:00Z'),
      }),
    ]);

    const result = await useCase.execute(TENANT_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result[0]).toMatchObject({
      email: 'moi@studiohub.vn',
      invitedByName: 'Chủ StudioHub',
      expiresAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    });
  });
});
