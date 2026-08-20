import { describe, expect, it } from 'vitest';
import type { InvitePartnerMemberInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PermissionEscalation,
  RoleNotFound,
} from '../../../identity-access/domain/errors/tenant-access-errors';
import type { IInvitationToken } from '../../../identity-access/domain/ports/invitation-token.port';
import type { IPermissionResolver } from '../../../identity-access/domain/ports/permission-resolver.port';
import type {
  CreateInvitationData,
  ITenantInvitationRepository,
} from '../../../identity-access/domain/ports/tenant-invitation-repository.port';
import type {
  IPartnerStaffRepository,
  PartnerRoleRow,
} from '../../domain/ports/partner-staff-repository.port';
import { InvitePartnerMemberUseCase } from './invite-partner-member.use-case';

const SCOPE = { tenantId: 'tenant-1', partnerId: 'partner-1' };
const CTX = { userId: 'user-caller' };
const MANAGE = 'partner.members.manage';
const LISTING = 'partner.listing.manage';

const role = (id: string, name: string, permissions: string[]): PartnerRoleRow => ({
  id,
  name,
  isSystem: false,
  permissions,
});

interface Options {
  callerHolds?: string[];
  assignable?: PartnerRoleRow[];
}

function harness(options: Options = {}) {
  const created: CreateInvitationData[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const audits: AuditEntry[] = [];
  const scopes: unknown[] = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new InvitePartnerMemberUseCase(
      fakePort<ITenantInvitationRepository>({
        create: (_tx, data) => {
          created.push(data);
          return Promise.resolve('invitation-1');
        },
      }),
      fakePort<IPartnerStaffRepository>({
        filterAssignableRoles: () =>
          Promise.resolve(options.assignable ?? [role('role-a', 'Nhân viên', [LISTING])]),
      }),
      fakePort<IPermissionResolver>({
        resolve: (_userId, scope) => {
          scopes.push(scope);
          return Promise.resolve(new Set(options.callerHolds ?? [MANAGE, LISTING]));
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      fakePort<IInvitationToken>({
        issue: () => ({ token: 'clear-token', tokenHash: 'hashed-token' }),
      }),
      new OutboxService(),
      tenantDb.service,
    ),
    tenantDb,
    created,
    events,
    audits,
    scopes,
  };
}

const input = (roleIds: string[]) =>
  ({ email: 'nhanvien@giangstudio.vn', roleIds }) as InvitePartnerMemberInput;

describe('InvitePartnerMemberUseCase', () => {
  it("resolves the caller's permissions within the PARTNER scope", async () => {
    const { useCase, scopes } = harness();

    await useCase.execute(SCOPE, input(['role-a']), CTX);

    expect(scopes).toEqual([SCOPE]);
  });

  it('refuses a role id not assignable in this partner', async () => {
    const { useCase, created } = harness();

    await expect(
      useCase.execute(SCOPE, input(['role-a', 'role-elsewhere']), CTX),
    ).rejects.toBeInstanceOf(RoleNotFound);
    expect(created).toEqual([]);
  });

  it('refuses to invite into a role stronger than the caller holds', async () => {
    const { useCase, created } = harness({
      callerHolds: [LISTING],
      assignable: [role('role-a', 'Quản lý', [MANAGE])],
    });

    await expect(useCase.execute(SCOPE, input(['role-a']), CTX)).rejects.toBeInstanceOf(
      PermissionEscalation,
    );
    expect(created).toEqual([]);
  });

  it('creates a PARTNER-scope invitation, not a tenant one', async () => {
    // One shared table across both tiers — an absent partnerId here would put
    // the invitee onto the tenant's own staff instead.
    const { useCase, created, tenantDb } = harness();

    await useCase.execute(SCOPE, input(['role-a']), CTX);

    expect(tenantDb.openedFor).toEqual([SCOPE.tenantId]);
    expect(created[0]).toMatchObject({
      tenantId: SCOPE.tenantId,
      partnerId: SCOPE.partnerId,
      email: 'nhanvien@giangstudio.vn',
      roleIds: ['role-a'],
      tokenHash: 'hashed-token',
      invitedByUserId: 'user-caller',
    });
  });

  it('stores only the token hash while the outbox carries the clear one', async () => {
    const { useCase, created, events } = harness();

    await useCase.execute(SCOPE, input(['role-a']), CTX);

    expect(JSON.stringify(created[0])).not.toContain('clear-token');
    expect(events).toEqual([
      {
        eventType: 'tenant.member_invited',
        payload: {
          invitationId: 'invitation-1',
          email: 'nhanvien@giangstudio.vn',
          token: 'clear-token',
          roleNames: ['Nhân viên'],
          partnerId: SCOPE.partnerId,
        },
      },
    ]);
  });

  it('expires the invitation seven days out', async () => {
    const { useCase, created } = harness();
    const before = Date.now();

    await useCase.execute(SCOPE, input(['role-a']), CTX);

    const week = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = created[0]?.expiresAt.getTime() ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(before + week);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + week);
  });

  it('records the invitation against the partner', async () => {
    const { useCase, audits } = harness();

    await useCase.execute(SCOPE, input(['role-a']), CTX);

    expect(audits).toEqual([
      {
        tenantId: SCOPE.tenantId,
        actorUserId: 'user-caller',
        action: 'partner_member.invited',
        entityType: 'tenant_invitation',
        entityId: 'invitation-1',
        data: {
          email: 'nhanvien@giangstudio.vn',
          roleIds: ['role-a'],
          partnerId: SCOPE.partnerId,
        },
      },
    ]);
  });
});
