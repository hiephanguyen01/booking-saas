import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  InvitationNotFound,
  InvitationNotPending,
} from '../../../identity-access/domain/errors/tenant-access-errors';
import type {
  InvitationRow,
  ITenantInvitationRepository,
} from '../../../identity-access/domain/ports/tenant-invitation-repository.port';
import { RevokePartnerInvitationUseCase } from './revoke-partner-invitation.use-case';

const SCOPE = { tenantId: 'tenant-1', partnerId: 'partner-1' };
const INVITATION_ID = 'invitation-1';
const CTX = { userId: 'user-caller' };

const row = (overrides: Partial<InvitationRow> = {}): InvitationRow => ({
  id: INVITATION_ID,
  tenantId: SCOPE.tenantId,
  tenantName: 'StudioHub',
  partnerId: SCOPE.partnerId,
  partnerName: 'Studio Giang',
  email: 'nhanvien@giangstudio.vn',
  roleIds: ['role-a'],
  status: 'pending',
  expiresAt: new Date('2026-09-01T00:00:00Z'),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  invitedByName: 'Giang',
  ...overrides,
});

function harness(rows: InvitationRow[] = [row()], revoked = true) {
  const revokes: unknown[] = [];
  const audits: AuditEntry[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new RevokePartnerInvitationUseCase(
      fakePort<ITenantInvitationRepository>({
        list: () => Promise.resolve(rows),
        revoke: (_tx, tenantId, invitationId) => {
          revokes.push({ tenantId, invitationId });
          return Promise.resolve(revoked);
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
    revokes,
    audits,
  };
}

describe('RevokePartnerInvitationUseCase', () => {
  it('answers not-found for an id this partner did not send', async () => {
    const { useCase, revokes } = harness([]);

    await expect(useCase.execute(SCOPE, INVITATION_ID, CTX)).rejects.toBeInstanceOf(
      InvitationNotFound,
    );
    expect(revokes).toEqual([]);
  });

  it("refuses a TENANT-scope invitation by guessing its id", async () => {
    // The table is shared across both tiers; a partner operator must not be
    // able to cancel the tenant's own invitations.
    const { useCase, revokes } = harness([row({ partnerId: null })]);

    await expect(useCase.execute(SCOPE, INVITATION_ID, CTX)).rejects.toBeInstanceOf(
      InvitationNotFound,
    );
    expect(revokes).toEqual([]);
  });

  it("refuses ANOTHER partner's invitation", async () => {
    const { useCase, revokes } = harness([row({ partnerId: 'partner-2' })]);

    await expect(useCase.execute(SCOPE, INVITATION_ID, CTX)).rejects.toBeInstanceOf(
      InvitationNotFound,
    );
    expect(revokes).toEqual([]);
  });

  it('reports an invitation that is no longer pending', async () => {
    const { useCase, audits } = harness([row()], false);

    await expect(useCase.execute(SCOPE, INVITATION_ID, CTX)).rejects.toBeInstanceOf(
      InvitationNotPending,
    );
    expect(audits).toEqual([]);
  });

  it('revokes a pending invitation and records it against the partner', async () => {
    const { useCase, revokes, audits } = harness();

    await useCase.execute(SCOPE, INVITATION_ID, CTX);

    expect(revokes).toEqual([{ tenantId: SCOPE.tenantId, invitationId: INVITATION_ID }]);
    expect(audits).toEqual([
      {
        tenantId: SCOPE.tenantId,
        actorUserId: 'user-caller',
        action: 'partner_member.invitation_revoked',
        entityType: 'tenant_invitation',
        entityId: INVITATION_ID,
        data: { partnerId: SCOPE.partnerId },
      },
    ]);
  });
});
