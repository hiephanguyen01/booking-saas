import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  InvitationNotFound,
  InvitationNotPending,
} from '../../domain/errors/tenant-access-errors';
import type {
  InvitationRow,
  ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import { RevokeTenantInvitationUseCase } from './revoke-tenant-invitation.use-case';

const TENANT_ID = 'tenant-1';
const INVITATION_ID = 'invitation-1';
const CTX = { userId: 'user-caller' };

const row = (overrides: Partial<InvitationRow> = {}): InvitationRow => ({
  id: INVITATION_ID,
  tenantId: TENANT_ID,
  tenantName: 'StudioHub',
  partnerId: null,
  partnerName: null,
  email: 'moi@studiohub.vn',
  roleIds: ['role-a'],
  status: 'pending',
  expiresAt: new Date('2026-09-01T00:00:00Z'),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  invitedByName: 'Chủ StudioHub',
  ...overrides,
});

function harness(rows: InvitationRow[] = [row()], revoked = true) {
  const revokes: Array<{ tenantId: string; invitationId: string }> = [];
  const audits: AuditEntry[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new RevokeTenantInvitationUseCase(
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

describe('RevokeTenantInvitationUseCase', () => {
  it('answers not-found for an id this tenant did not send', async () => {
    const { useCase, revokes } = harness([]);

    await expect(useCase.execute(TENANT_ID, INVITATION_ID, CTX)).rejects.toBeInstanceOf(
      InvitationNotFound,
    );
    expect(revokes).toEqual([]);
  });

  it("refuses to revoke a PARTNER-scope invitation by guessing its id", async () => {
    // One shared table across both tiers, so an id alone proves nothing about
    // who may act on it — and the answer is the same not-found, which does not
    // confirm the row exists.
    const { useCase, revokes } = harness([row({ partnerId: 'partner-1' })]);

    await expect(useCase.execute(TENANT_ID, INVITATION_ID, CTX)).rejects.toBeInstanceOf(
      InvitationNotFound,
    );
    expect(revokes).toEqual([]);
  });

  it('checks the scope BEFORE issuing the revoke', async () => {
    const { useCase, revokes } = harness([row({ partnerId: 'partner-1' })]);

    await useCase.execute(TENANT_ID, INVITATION_ID, CTX).catch(() => undefined);

    expect(revokes).toEqual([]);
  });

  it('reports an invitation that is no longer pending', async () => {
    // The revoke is a compare-and-set; losing it means someone accepted in the
    // meantime, and reporting success would hide that.
    const { useCase, audits } = harness([row()], false);

    await expect(useCase.execute(TENANT_ID, INVITATION_ID, CTX)).rejects.toBeInstanceOf(
      InvitationNotPending,
    );
    expect(audits).toEqual([]);
  });

  it('revokes a pending invitation and records who did it', async () => {
    const { useCase, revokes, audits } = harness();

    await useCase.execute(TENANT_ID, INVITATION_ID, CTX);

    expect(revokes).toEqual([{ tenantId: TENANT_ID, invitationId: INVITATION_ID }]);
    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: 'user-caller',
        action: 'invitation.revoked',
        entityType: 'tenant_invitation',
        entityId: INVITATION_ID,
      },
    ]);
  });
});
