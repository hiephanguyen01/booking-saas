import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  InvitationEmailMismatch,
  InvitationNotFound,
  InvitationNotPending,
  InvitationRolesGone,
} from '../../domain/errors/tenant-access-errors';
import type { IInvitationToken } from '../../domain/ports/invitation-token.port';
import type { IPartnerMembershipWriter } from '../../domain/ports/partner-membership-writer.port';
import type { IPermissionResolver } from '../../domain/ports/permission-resolver.port';
import type {
  InvitationRow,
  ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import type {
  ITenantMemberRepository,
  MemberRow,
} from '../../domain/ports/tenant-member-repository.port';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { AcceptTenantInvitationUseCase } from './accept-tenant-invitation.use-case';

const TENANT_ID = 'tenant-1';
const CTX = { userId: 'user-invitee', email: 'Moi@StudioHub.vn' };

const row = (overrides: Partial<InvitationRow> = {}): InvitationRow => ({
  id: 'invitation-1',
  tenantId: TENANT_ID,
  tenantName: 'StudioHub',
  partnerId: null,
  partnerName: null,
  email: 'moi@studiohub.vn',
  roleIds: ['role-a', 'role-b'],
  status: 'pending',
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  invitedByName: 'Chủ StudioHub',
  ...overrides,
});

const role = (id: string): RoleRow => ({
  id,
  name: id,
  isSystem: false,
  permissions: [],
  memberCount: 0,
});

interface Options {
  found?: InvitationRow | null;
  assignable?: RoleRow[];
  existing?: MemberRow | null;
  accepted?: boolean;
  materialized?: string[];
}

function harness(options: Options = {}) {
  const added: Array<{ tenantId: string; userId: string; roleIds: readonly string[] }> = [];
  const materializeArgs: unknown[] = [];
  const audits: AuditEntry[] = [];
  const hashed: string[] = [];
  const order: string[] = [];
  const tenantDb = fakeTenantDb({
    onOpen: (tenantId) => order.push(`open:${tenantId}`),
    onClose: () => order.push('closeTransaction'),
  });
  return {
    useCase: new AcceptTenantInvitationUseCase(
      fakePort<ITenantInvitationRepository>({
        findByTokenHash: () => Promise.resolve(options.found === undefined ? row() : options.found),
        markAccepted: () => {
          order.push('markAccepted');
          return Promise.resolve(options.accepted ?? true);
        },
      }),
      fakePort<ITenantMemberRepository>({
        findOne: () => Promise.resolve(options.existing ?? null),
        addRoles: (_tx, tenantId, userId, roleIds) => {
          order.push('addRoles');
          added.push({ tenantId, userId, roleIds });
          return Promise.resolve();
        },
      }),
      fakePort<ITenantRoleRepository>({
        filterAssignable: () =>
          Promise.resolve(options.assignable ?? [role('role-a'), role('role-b')]),
      }),
      fakePort<IPartnerMembershipWriter>({
        materialize: (_tx, args) => {
          materializeArgs.push(args);
          return Promise.resolve(options.materialized ?? ['role-a']);
        },
      }),
      fakePort<IPermissionResolver>({
        invalidate: (userId) => {
          order.push(`invalidate:${userId}`);
          return Promise.resolve();
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      fakePort<IInvitationToken>({
        hash: (token) => {
          hashed.push(token);
          return 'hashed-token';
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    added,
    materializeArgs,
    audits,
    hashed,
    order,
  };
}

const member = (roleIds: string[]): MemberRow =>
  ({
    userId: CTX.userId,
    fullName: 'Người Mới',
    email: CTX.email,
    avatarUrl: null,
    roles: roleIds.map((id) => ({ id, name: id })),
    permissions: [],
    joinedAt: new Date('2026-01-01T00:00:00Z'),
  }) as MemberRow;

describe('AcceptTenantInvitationUseCase', () => {
  it('looks the invitation up by the token HASH, never the clear token', async () => {
    const { useCase, hashed } = harness();

    await useCase.execute('clear-token', CTX);

    expect(hashed).toEqual(['clear-token']);
  });

  it('answers not-found for an unknown token', async () => {
    const { useCase, added } = harness({ found: null });

    await expect(useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(InvitationNotFound);
    expect(added).toEqual([]);
  });

  it('refuses an EXPIRED invitation, whose row still says pending', async () => {
    // Expiry is derived from the clock, so the stored status alone would let a
    // week-old link through.
    const { useCase, added } = harness({
      found: row({ expiresAt: new Date(Date.now() - 60_000) }),
    });

    await expect(useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(InvitationNotPending);
    expect(added).toEqual([]);
  });

  it('refuses an already-accepted or revoked invitation', async () => {
    const accepted = harness({ found: row({ status: 'accepted' }) });
    const revoked = harness({ found: row({ status: 'revoked' }) });

    await expect(accepted.useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(
      InvitationNotPending,
    );
    await expect(revoked.useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(
      InvitationNotPending,
    );
  });

  it('refuses an invitation addressed to a DIFFERENT address', async () => {
    // Forwarding the link must not let the recipient join on someone else's
    // invitation.
    const { useCase, added } = harness({ found: row({ email: 'aikhac@studiohub.vn' }) });

    await expect(useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(
      InvitationEmailMismatch,
    );
    expect(added).toEqual([]);
  });

  it('compares the addresses case-insensitively, matching the citext column', async () => {
    // The signed-in email is `Moi@StudioHub.vn`, the invitation `moi@studiohub.vn`.
    const { useCase, added } = harness();

    await useCase.execute('clear-token', CTX);

    expect(added).toHaveLength(1);
  });

  it("opens the transaction on the INVITATION's tenant", async () => {
    // The caller holds no membership yet, so an `x-tenant-id` header would be
    // theirs to choose — the tenant has to come from the row.
    const { useCase, tenantDb } = harness({ found: row({ tenantId: 'tenant-9' }) });

    await useCase.execute('clear-token', CTX);

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
  });

  it('drops a role deleted since the invite was sent', async () => {
    const { useCase, added } = harness({ assignable: [role('role-a')] });

    await useCase.execute('clear-token', CTX);

    expect(added).toEqual([
      { tenantId: TENANT_ID, userId: CTX.userId, roleIds: ['role-a'] },
    ]);
  });

  it('refuses when EVERY invited role is gone', async () => {
    const { useCase, added } = harness({ assignable: [] });

    await expect(useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(InvitationRolesGone);
    expect(added).toEqual([]);
  });

  it('ADDS to the roles the member already holds, never replacing them', async () => {
    // Re-inviting an existing member grants extra roles; it must not quietly
    // strip one they already have.
    const { useCase, added } = harness({ existing: member(['role-existing']) });

    await useCase.execute('clear-token', CTX);

    expect(added).toEqual([
      { tenantId: TENANT_ID, userId: CTX.userId, roleIds: ['role-a', 'role-b'] },
    ]);
  });

  it('treats "already holds every invited role" as a no-op, NOT as roles-gone', async () => {
    // The roles survived; there is simply nothing to add. Reporting
    // InvitationRolesGone here would tell the recipient the invite was broken.
    const { useCase, added, audits } = harness({ existing: member(['role-a', 'role-b']) });

    await useCase.execute('clear-token', CTX);

    expect(added).toEqual([]);
    expect(audits[0]?.data).toEqual({ roleIds: [] });
  });

  it('reports the loser of a concurrent accept rather than assigning twice', async () => {
    const { useCase, added } = harness({ accepted: false });

    await expect(useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(InvitationNotPending);
    expect(added).toEqual([]);
  });

  it('reports the loser of a concurrent PARTNER accept as well', async () => {
    // Both branches claim the row; only one of them is on the tenant path, so
    // the partner branch needs its own compare-and-set.
    const { useCase } = harness({ found: row({ partnerId: 'partner-1' }), accepted: false });

    await expect(useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(InvitationNotPending);
  });

  it('claims the invitation BEFORE writing any assignment', async () => {
    // The compare-and-set is what makes two simultaneous accepts safe; assigning
    // first would let both write.
    const { useCase, order } = harness();

    await useCase.execute('clear-token', CTX);

    expect(order.indexOf('markAccepted')).toBeLessThan(order.indexOf('addRoles'));
  });

  it("hands a PARTNER-scope invitation to the partner module's writer", async () => {
    // partner_members belongs to the partner module; identity-access must never
    // reach into that table itself.
    const { useCase, materializeArgs, added } = harness({
      found: row({ partnerId: 'partner-1' }),
    });

    await useCase.execute('clear-token', CTX);

    expect(materializeArgs).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: 'partner-1',
        userId: CTX.userId,
        roleIds: ['role-a', 'role-b'],
      },
    ]);
    expect(added).toEqual([]);
  });

  it('refuses a partner-scope accept that materialised nothing', async () => {
    const { useCase } = harness({ found: row({ partnerId: 'partner-1' }), materialized: [] });

    await expect(useCase.execute('clear-token', CTX)).rejects.toBeInstanceOf(InvitationRolesGone);
  });

  it('records which roles the acceptance actually granted', async () => {
    const { useCase, audits } = harness({ assignable: [role('role-a')] });

    await useCase.execute('clear-token', CTX);

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: CTX.userId,
        action: 'member.invitation_accepted',
        entityType: 'tenant_invitation',
        entityId: 'invitation-1',
        data: { roleIds: ['role-a'] },
      },
    ]);
  });

  it('drops the cached permissions after the transaction closes', async () => {
    // Invalidating inside could race a concurrent read against an assignment
    // that has not committed.
    const { useCase, order } = harness();

    await useCase.execute('clear-token', CTX);

    expect(order.at(-1)).toBe(`invalidate:${CTX.userId}`);
    expect(order.at(-2)).toBe('closeTransaction');
  });
});
