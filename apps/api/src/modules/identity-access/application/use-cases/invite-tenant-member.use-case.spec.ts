import { describe, expect, it } from 'vitest';
import type { InviteTenantMemberInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { PermissionEscalation, RoleNotFound } from '../../domain/errors/tenant-access-errors';
import type { IInvitationToken } from '../../domain/ports/invitation-token.port';
import type { IPermissionResolver } from '../../domain/ports/permission-resolver.port';
import type {
  CreateInvitationData,
  ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import type { ITenantRoleRepository, RoleRow } from '../../domain/ports/tenant-role-repository.port';
import { InviteTenantMemberUseCase } from './invite-tenant-member.use-case';

const TENANT_ID = 'tenant-1';
const CTX = { userId: 'user-caller' };
const MANAGE = 'tenant.members.manage';
const APPROVE = 'tenant.listing.approve';

const role = (id: string, name: string, permissions: string[]): RoleRow => ({
  id,
  name,
  isSystem: false,
  permissions,
  memberCount: 0,
});

interface Options {
  callerHolds?: string[];
  assignable?: RoleRow[];
}

function harness(options: Options = {}) {
  const created: CreateInvitationData[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const audits: AuditEntry[] = [];
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
    useCase: new InviteTenantMemberUseCase(
      fakePort<ITenantInvitationRepository>({
        create: (_tx, data) => {
          created.push(data);
          return Promise.resolve('invitation-1');
        },
      }),
      fakePort<ITenantRoleRepository>({
        filterAssignable: () =>
          Promise.resolve(options.assignable ?? [role('role-a', 'Lễ tân', [APPROVE])]),
      }),
      fakePort<IPermissionResolver>({
        resolve: () => Promise.resolve(new Set(options.callerHolds ?? [MANAGE, APPROVE])),
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
  };
}

const input = (roleIds: string[]) =>
  ({ email: 'moi@studiohub.vn', roleIds }) as InviteTenantMemberInput;

describe('InviteTenantMemberUseCase', () => {
  it('refuses a role id that is not assignable in this tenant', async () => {
    const { useCase, created } = harness({ assignable: [role('role-a', 'Lễ tân', [APPROVE])] });

    await expect(
      useCase.execute(TENANT_ID, input(['role-a', 'role-elsewhere']), CTX),
    ).rejects.toBeInstanceOf(RoleNotFound);
    expect(created).toEqual([]);
  });

  it('refuses to invite someone into a role stronger than the caller', async () => {
    const { useCase, created } = harness({
      callerHolds: [APPROVE],
      assignable: [role('role-a', 'Quản lý', [MANAGE])],
    });

    await expect(useCase.execute(TENANT_ID, input(['role-a']), CTX)).rejects.toBeInstanceOf(
      PermissionEscalation,
    );
    expect(created).toEqual([]);
  });

  it('stores only the token HASH, never the clear token', async () => {
    // A leaked invitations table must not hand an attacker a working link.
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input(['role-a']), CTX);

    expect(created[0]?.tokenHash).toBe('hashed-token');
    expect(JSON.stringify(created[0])).not.toContain('clear-token');
  });

  it('carries the CLEAR token in the outbox payload, which is what the mailer needs', async () => {
    // The mail must not escape a rolled-back invite, so it goes through the
    // outbox rather than a direct send.
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, input(['role-a']), CTX);

    expect(events).toEqual([
      {
        eventType: 'tenant.member_invited',
        payload: {
          invitationId: 'invitation-1',
          email: 'moi@studiohub.vn',
          token: 'clear-token',
          roleNames: ['Lễ tân'],
        },
      },
    ]);
  });

  it('expires the invitation seven days out', async () => {
    const { useCase, created } = harness();
    const before = Date.now();

    await useCase.execute(TENANT_ID, input(['role-a']), CTX);

    const week = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = created[0]?.expiresAt.getTime() ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(before + week);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + week);
  });

  it('records the tenant, the invitee, the roles and who invited them', async () => {
    const { useCase, created, tenantDb } = harness();

    await useCase.execute(TENANT_ID, input(['role-a']), CTX);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      tenantId: TENANT_ID,
      email: 'moi@studiohub.vn',
      roleIds: ['role-a'],
      invitedByUserId: 'user-caller',
    });
  });

  it('creates a TENANT-scope invitation, never a partner one', async () => {
    // The table is shared across both tiers; a stray partnerId here would put
    // the invitee into a partner's staff instead.
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input(['role-a']), CTX);

    expect(created[0]?.partnerId).toBeUndefined();
  });

  it('writes the audit row', async () => {
    const { useCase, audits } = harness();

    await useCase.execute(TENANT_ID, input(['role-a']), CTX);

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: 'user-caller',
        action: 'member.invited',
        entityType: 'tenant_invitation',
        entityId: 'invitation-1',
        data: { email: 'moi@studiohub.vn', roleIds: ['role-a'] },
      },
    ]);
  });
});
