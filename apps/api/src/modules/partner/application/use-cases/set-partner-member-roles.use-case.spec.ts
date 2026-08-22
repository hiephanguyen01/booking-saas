import { describe, expect, it } from 'vitest';
import type { SetPartnerMemberRolesInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  CannotEditSelf,
  LastManagerRemoved,
  MemberNotFound,
  PermissionEscalation,
  RoleNotFound,
} from '../../../identity-access/domain/errors/tenant-access-errors';
import type { IPermissionResolver } from '../../../identity-access/domain/ports/permission-resolver.port';
import type {
  IPartnerStaffRepository,
  PartnerRoleRow,
  PartnerStaffRow,
} from '../../domain/ports/partner-staff-repository.port';
import { SetPartnerMemberRolesUseCase } from './set-partner-member-roles.use-case';

const SCOPE = { tenantId: 'tenant-1', partnerId: 'partner-1' };
const CALLER = 'user-caller';
const TARGET = 'user-target';
const CTX = { userId: CALLER };
const MANAGE = 'partner.members.manage';
const LISTING = 'partner.listing.manage';

const role = (id: string, permissions: string[]): PartnerRoleRow => ({
  id,
  name: id,
  isSystem: false,
  permissions,
});

const member = (userId: string, permissions: string[]): PartnerStaffRow => ({
  userId,
  fullName: userId,
  email: `${userId}@giangstudio.vn`,
  avatarUrl: null,
  roles: [],
  permissions,
  joinedAt: new Date('2026-01-01T00:00:00Z'),
  membershipMissing: false,
});

interface Options {
  callerHolds?: string[];
  target?: PartnerStaffRow | null;
  assignable?: PartnerRoleRow[];
  all?: PartnerStaffRow[];
}

function harness(options: Options = {}) {
  const roleWrites: unknown[] = [];
  const audits: AuditEntry[] = [];
  const scopes: unknown[] = [];
  const order: string[] = [];
  const tenantDb = fakeTenantDb({
    onOpen: () => order.push('openTransaction'),
    onClose: () => order.push('closeTransaction'),
  });
  return {
    useCase: new SetPartnerMemberRolesUseCase(
      fakePort<IPartnerStaffRepository>({
        findOne: () =>
          Promise.resolve(
            options.target === undefined ? member(TARGET, [LISTING]) : options.target,
          ),
        filterAssignableRoles: () =>
          Promise.resolve(options.assignable ?? [role('role-b', [LISTING])]),
        list: () =>
          Promise.resolve(
            options.all ?? [member(CALLER, [MANAGE]), member(TARGET, [LISTING])],
          ),
        setRoles: (_tx, params) => {
          roleWrites.push(params);
          return Promise.resolve();
        },
      }),
      fakePort<IPermissionResolver>({
        resolve: (_userId, scope) => {
          scopes.push(scope);
          return Promise.resolve(new Set(options.callerHolds ?? [MANAGE, LISTING]));
        },
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
      tenantDb.service,
    ),
    tenantDb,
    roleWrites,
    audits,
    scopes,
    order,
  };
}

const input = (roleIds: string[]) => ({ roleIds }) as SetPartnerMemberRolesInput;

describe('SetPartnerMemberRolesUseCase', () => {
  it('refuses to edit your OWN roles', async () => {
    const { useCase, tenantDb } = harness();

    await expect(
      useCase.execute(SCOPE, CALLER, input(['role-b']), CTX),
    ).rejects.toBeInstanceOf(CannotEditSelf);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it("resolves the caller's permissions within the PARTNER scope", async () => {
    // A tenant-scope resolve would let a tenant permission authorise a partner
    // role grant.
    const { useCase, scopes } = harness();

    await useCase.execute(SCOPE, TARGET, input(['role-b']), CTX);

    expect(scopes).toEqual([SCOPE]);
  });

  it('answers not-found for someone who is not on this partner staff', async () => {
    const { useCase, roleWrites } = harness({ target: null });

    await expect(
      useCase.execute(SCOPE, TARGET, input(['role-b']), CTX),
    ).rejects.toBeInstanceOf(MemberNotFound);
    expect(roleWrites).toEqual([]);
  });

  it('refuses a role id that is not assignable in THIS partner', async () => {
    const { useCase, roleWrites } = harness({ assignable: [role('role-b', [LISTING])] });

    await expect(
      useCase.execute(SCOPE, TARGET, input(['role-b', 'role-elsewhere']), CTX),
    ).rejects.toBeInstanceOf(RoleNotFound);
    expect(roleWrites).toEqual([]);
  });

  it('refuses to grant a role stronger than the caller holds', async () => {
    const { useCase, roleWrites } = harness({
      callerHolds: [LISTING],
      assignable: [role('role-b', [MANAGE])],
    });

    await expect(
      useCase.execute(SCOPE, TARGET, input(['role-b']), CTX),
    ).rejects.toBeInstanceOf(PermissionEscalation);
    expect(roleWrites).toEqual([]);
  });

  it('REFUSES a demotion leaving nobody able to manage partner staff', async () => {
    // Same lockout rule as the tenant tier, keyed on the PARTNER manage
    // permission — a partner locked out of its own staff cannot recover.
    const { useCase, roleWrites } = harness({
      all: [member(TARGET, [MANAGE])],
      assignable: [role('role-b', [LISTING])],
    });

    await expect(
      useCase.execute(SCOPE, TARGET, input(['role-b']), CTX),
    ).rejects.toBeInstanceOf(LastManagerRemoved);
    expect(roleWrites).toEqual([]);
  });

  it("checks the lockout against the target's NEW permissions", async () => {
    const { useCase, roleWrites } = harness({
      all: [member(TARGET, [MANAGE])],
      assignable: [role('role-b', [MANAGE])],
    });

    await useCase.execute(SCOPE, TARGET, input(['role-b']), CTX);

    expect(roleWrites).toHaveLength(1);
  });

  it('REPLACES the role set without touching the membership', async () => {
    // `setRoles` is deliberately not `removeStaff` + `addStaff`: the person
    // stays on the team through a role change.
    const { useCase, roleWrites } = harness();

    await useCase.execute(SCOPE, TARGET, input(['role-b']), CTX);

    expect(roleWrites).toEqual([{ ...SCOPE, userId: TARGET, roleIds: ['role-b'] }]);
  });

  it('drops the cached permissions after the transaction closes', async () => {
    const { useCase, order } = harness();

    await useCase.execute(SCOPE, TARGET, input(['role-b']), CTX);

    expect(order.at(-1)).toBe(`invalidate:${TARGET}`);
    expect(order.at(-2)).toBe('closeTransaction');
  });

  it('records the change against the partner', async () => {
    const { useCase, audits } = harness();

    await useCase.execute(SCOPE, TARGET, input(['role-b']), CTX);

    expect(audits).toEqual([
      {
        tenantId: SCOPE.tenantId,
        actorUserId: CALLER,
        action: 'partner_member.roles_changed',
        entityType: 'user',
        entityId: TARGET,
        data: { partnerId: SCOPE.partnerId, roleIds: ['role-b'] },
      },
    ]);
  });
});
