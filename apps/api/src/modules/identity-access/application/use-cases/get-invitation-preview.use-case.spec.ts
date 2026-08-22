import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { InvitationNotFound } from '../../domain/errors/tenant-access-errors';
import type { IInvitationToken } from '../../domain/ports/invitation-token.port';
import type { IPartnerRoleReader } from '../../domain/ports/partner-role-reader.port';
import type {
  InvitationRow,
  ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { GetInvitationPreviewUseCase } from './get-invitation-preview.use-case';

const TENANT_ID = 'tenant-1';
const CTX = { userId: 'user-invitee', email: 'Moi@StudioHub.vn' };

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

const TENANT_ROLE: RoleRow = {
  id: 'role-a',
  name: 'Lễ tân',
  isSystem: false,
  permissions: ['tenant.listing.approve'],
  memberCount: 0,
};

function harness(found: InvitationRow | null = row()) {
  const tenantAsked: unknown[] = [];
  const partnerAsked: unknown[] = [];
  const lookedUpBy: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetInvitationPreviewUseCase(
      fakePort<ITenantInvitationRepository>({
        findByTokenHash: (tokenHash) => {
          lookedUpBy.push(tokenHash);
          return Promise.resolve(found);
        },
      }),
      fakePort<ITenantRoleRepository>({
        filterAssignable: (_tx, tenantId, roleIds) => {
          tenantAsked.push({ tenantId, roleIds });
          return Promise.resolve([TENANT_ROLE]);
        },
      }),
      fakePort<IPartnerRoleReader>({
        filterAssignable: (_tx, partnerId, roleIds) => {
          partnerAsked.push({ partnerId, roleIds });
          return Promise.resolve([{ id: 'role-a', name: 'Nhân viên đối tác' }]);
        },
      }),
      fakePort<IInvitationToken>({ hash: () => 'hashed-token' }),
      tenantDb.service,
    ),
    tenantDb,
    tenantAsked,
    partnerAsked,
    lookedUpBy,
  };
}

describe('GetInvitationPreviewUseCase', () => {
  it('looks the invitation up by the token HASH, never the clear token', async () => {
    // The stored column is a hash (ADR 0001); querying by the clear token would
    // match nothing, and matching on it would mean the table stores it.
    const { useCase, lookedUpBy } = harness();

    await useCase.execute('clear-token', CTX);

    expect(lookedUpBy).toEqual(['hashed-token']);
  });

  it('answers not-found for an unknown token', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(InvitationNotFound);
  });

  it('REPORTS an email mismatch instead of failing to load', async () => {
    // The screen needs to explain "this invite was sent to a different address";
    // an error would leave the recipient with a blank page.
    const { useCase } = harness(row({ email: 'aikhac@studiohub.vn' }));

    const result = await useCase.execute('clear-token', CTX);

    expect(result.matchesCurrentUser).toBe(false);
    expect(result.invitedEmail).toBe('aikhac@studiohub.vn');
  });

  it('matches the address case-insensitively', async () => {
    const { useCase } = harness();

    const result = await useCase.execute('clear-token', CTX);

    expect(result.matchesCurrentUser).toBe(true);
  });

  it('resolves a TENANT invitation through the tenant role port', async () => {
    const { useCase, tenantAsked, partnerAsked } = harness();

    const result = await useCase.execute('clear-token', CTX);

    expect(tenantAsked).toEqual([{ tenantId: TENANT_ID, roleIds: ['role-a'] }]);
    expect(partnerAsked).toEqual([]);
    expect(result.roles).toEqual([{ id: 'role-a', name: 'Lễ tân' }]);
  });

  it('resolves a PARTNER invitation through the partner role reader', async () => {
    // The tenant port filters on `scopeLevel: 'tenant'` and would silently
    // return nothing for partner role ids — which is exactly how this shipped
    // broken once.
    const { useCase, tenantAsked, partnerAsked } = harness(
      row({ partnerId: 'partner-1', partnerName: 'Studio Giang' }),
    );

    const result = await useCase.execute('clear-token', CTX);

    expect(partnerAsked).toEqual([{ partnerId: 'partner-1', roleIds: ['role-a'] }]);
    expect(tenantAsked).toEqual([]);
    expect(result.roles).toEqual([{ id: 'role-a', name: 'Nhân viên đối tác' }]);
  });

  it('names the partner so the recipient knows what they are joining', async () => {
    const { useCase } = harness(row({ partnerId: 'partner-1', partnerName: 'Studio Giang' }));

    const result = await useCase.execute('clear-token', CTX);

    expect(result).toMatchObject({ tenantName: 'StudioHub', partnerName: 'Studio Giang' });
  });

  it('leaves partnerName null for a tenant-scope invitation', async () => {
    const { useCase } = harness();

    const result = await useCase.execute('clear-token', CTX);

    expect(result.partnerName).toBeNull();
  });

  it("opens the transaction on the INVITATION's tenant", async () => {
    const { useCase, tenantDb } = harness(row({ tenantId: 'tenant-9' }));

    await useCase.execute('clear-token', CTX);

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
  });

  it('derives the expired state from the clock', async () => {
    const { useCase } = harness(row({ expiresAt: new Date(Date.now() - 60_000) }));

    const result = await useCase.execute('clear-token', CTX);

    expect(result.status).toBe('expired');
  });
});
