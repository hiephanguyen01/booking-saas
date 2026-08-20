import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  InvitationRow,
  ITenantInvitationRepository,
} from '../../../identity-access/domain/ports/tenant-invitation-repository.port';
import type {
  IPartnerStaffRepository,
  PartnerRoleRow,
} from '../../domain/ports/partner-staff-repository.port';
import { ListPartnerInvitationsUseCase } from './list-partner-invitations.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

const row = (overrides: Partial<InvitationRow> = {}): InvitationRow => ({
  id: 'invitation-1',
  tenantId: TENANT_ID,
  tenantName: 'StudioHub',
  partnerId: PARTNER_ID,
  partnerName: 'Studio Giang',
  email: 'nhanvien@giangstudio.vn',
  roleIds: ['role-a'],
  status: 'pending',
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  invitedByName: 'Giang',
  ...overrides,
});

const ROLES: PartnerRoleRow[] = [
  { id: 'role-a', name: 'Nhân viên', isSystem: false, permissions: [] },
];

function harness(rows: InvitationRow[]) {
  const tenantDb = fakeTenantDb();
  return new ListPartnerInvitationsUseCase(
    fakePort<ITenantInvitationRepository>({ list: () => Promise.resolve(rows) }),
    fakePort<IPartnerStaffRepository>({ listAssignableRoles: () => Promise.resolve(ROLES) }),
    tenantDb.service,
  );
}

describe('ListPartnerInvitationsUseCase', () => {
  it('keeps only THIS partner’s rows, hiding tenant and sibling ones', async () => {
    // One shared table: a tenant-scope row and another partner's row both carry
    // this tenant id, and their role names would never resolve here.
    const useCase = harness([
      row(),
      row({ id: 'tenant-scope', partnerId: null }),
      row({ id: 'sibling', partnerId: 'partner-2' }),
    ]);

    const result = await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(result.map((r) => r.id)).toEqual(['invitation-1']);
  });

  it('derives the expired state from the clock', async () => {
    const useCase = harness([
      row({ id: 'fresh' }),
      row({ id: 'stale', expiresAt: new Date(Date.now() - 60_000) }),
    ]);

    const result = await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(result.map((r) => [r.id, r.status])).toEqual([
      ['fresh', 'pending'],
      ['stale', 'expired'],
    ]);
  });

  it('resolves role names, dropping one deleted since the invite went out', async () => {
    const useCase = harness([row({ roleIds: ['role-a', 'role-gone'] })]);

    const result = await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(result[0]?.roles).toEqual([{ id: 'role-a', name: 'Nhân viên' }]);
  });
});
