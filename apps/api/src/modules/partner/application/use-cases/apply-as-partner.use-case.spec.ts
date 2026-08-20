import { describe, expect, it } from 'vitest';
import type { PartnerApplyInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import type { AssertCanAddPartnerUseCase } from '../../../tenancy/application/use-cases/assert-can-add-partner.use-case';
import type { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import type { RecordLegalAcceptanceUseCase } from '../../../legal/application/use-cases/record-legal-acceptance.use-case';
import { PartnerSlugTaken, TenantInactive } from '../../domain/errors/partner-errors';
import type { NewPartner } from '../../domain/entities/partner.entity';
import type { IPartnerRepository, PartnerRecord } from '../../domain/ports/partner-repository.port';
import type { IPartnerRoles } from '../../domain/ports/partner-roles.port';
import { ApplyAsPartnerUseCase } from './apply-as-partner.use-case';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const PARTNER_ID = 'partner-new';

const RESOLVED = {
  province: { code: '79', name: 'TP. Hồ Chí Minh', type: 'thanh_pho' },
  ward: { code: '26734', name: 'Phường Bến Nghé', type: 'phuong' },
};

interface Options {
  tenant?: TenantRecord | null;
  slugTaken?: boolean;
  planError?: Error;
  legalError?: Error;
}

function harness(options: Options = {}) {
  const created: NewPartner[] = [];
  const members: unknown[] = [];
  const assignments: unknown[] = [];
  const legalCalls: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const order: string[] = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({
    tx,
    onOpen: () => order.push('openTransaction'),
    onClose: () => order.push('closeTransaction'),
  });
  let reads = 0;
  return {
    useCase: new ApplyAsPartnerUseCase(
      fakePort<IPartnerRepository>({
        findBySlug: () =>
          Promise.resolve(options.slugTaken ? ({ id: 'partner-2' } as PartnerRecord) : null),
        create: (_tx, data) => {
          created.push(data);
          return Promise.resolve({ id: PARTNER_ID, ...data, owner: null } as unknown as PartnerRecord);
        },
        addMember: (_tx, args) => {
          order.push('addMember');
          members.push(args);
          return Promise.resolve();
        },
        assignRole: (_tx, args) => {
          assignments.push(args);
          return Promise.resolve();
        },
        findById: () => {
          reads += 1;
          return Promise.resolve({
            id: PARTNER_ID,
            owner: { userId: USER_ID, fullName: 'Người Nộp Đơn' },
          } as unknown as PartnerRecord);
        },
      }),
      fakePort<IPartnerRoles>({
        partnerOwnerRoleId: () => Promise.resolve('role-partner-owner'),
        invalidateUserPermissions: (userId) => {
          order.push(`invalidate:${userId}`);
          return Promise.resolve();
        },
      }),
      fakePort<ITenantRepository>({
        findById: () =>
          Promise.resolve(
            options.tenant === undefined
              ? ({ id: TENANT_ID, status: 'active' } as TenantRecord)
              : options.tenant,
          ),
      }),
      fakeCollaborator<AssertCanAddPartnerUseCase>({
        execute: () => {
          order.push('planLimit');
          return options.planError ? Promise.reject(options.planError) : Promise.resolve(undefined);
        },
      }),
      fakeCollaborator<ResolveAdministrativeAddressUseCase>({
        execute: () => {
          order.push('resolveAddress');
          return Promise.resolve(RESOLVED);
        },
      }),
      tenantDb.service,
      new OutboxService(),
      fakeCollaborator<RecordLegalAcceptanceUseCase>({
        execute: (_tx: unknown, args: unknown) => {
          order.push('legalAcceptance');
          legalCalls.push(args);
          return options.legalError ? Promise.reject(options.legalError) : Promise.resolve(undefined);
        },
      }),
    ),
    tenantDb,
    created,
    members,
    assignments,
    legalCalls,
    events,
    order,
    reads: () => reads,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    tenantId: TENANT_ID,
    name: 'Studio Giang',
    slug: 'studio-giang',
    partnerType: 'individual',
    contactInfo: {
      phone: '0900000000',
      provinceCode: '79',
      wardCode: '26734',
      address: '12 Nguyễn Huệ',
    },
    legalConsent: { acceptedVersionIds: ['doc-v1'], acceptedLocale: 'vi' },
    ...overrides,
  }) as unknown as PartnerApplyInput;

const CTX = { ip: '203.0.113.9' };

describe('ApplyAsPartnerUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase, created } = harness({ tenant: null });

    await expect(useCase.execute(USER_ID, input(), CTX)).rejects.toBeInstanceOf(TenantNotFound);
    expect(created).toEqual([]);
  });

  it('refuses an application to a SUSPENDED tenant', async () => {
    const { useCase, created } = harness({
      tenant: { id: TENANT_ID, status: 'suspended' } as TenantRecord,
    });

    await expect(useCase.execute(USER_ID, input(), CTX)).rejects.toBeInstanceOf(TenantInactive);
    expect(created).toEqual([]);
  });

  it("enforces the plan's partner cap on this route", async () => {
    // The route carries no tenant context, so PlanLimitGuard never runs — the
    // check has to happen here or the cap is unenforced for self-signup.
    const { useCase, created } = harness({ planError: new Error('cap reached') });

    await expect(useCase.execute(USER_ID, input(), CTX)).rejects.toThrow('cap reached');
    expect(created).toEqual([]);
  });

  it('refuses a slug another partner holds', async () => {
    const { useCase, created } = harness({ slugTaken: true });

    await expect(useCase.execute(USER_ID, input(), CTX)).rejects.toBeInstanceOf(PartnerSlugTaken);
    expect(created).toEqual([]);
  });

  it('creates the partner PENDING and unverified', async () => {
    // The applicant may complete their profile while waiting, but nothing is
    // sellable until the tenant approves.
    const { useCase, created } = harness();

    await useCase.execute(USER_ID, input(), CTX);

    expect(created[0]).toMatchObject({
      tenantId: TENANT_ID,
      slug: 'studio-giang',
      status: 'pending',
      verificationStatus: 'unsubmitted',
      isHouse: false,
      verifiedAt: null,
    });
  });

  it('stores the RESOLVED administrative names, not the submitted codes', async () => {
    const { useCase, created } = harness();

    await useCase.execute(USER_ID, input(), CTX);

    expect(created[0]?.contactInfo).toEqual({
      phone: '0900000000',
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      provinceType: 'thanh_pho',
      wardCode: '26734',
      wardName: 'Phường Bến Nghé',
      wardType: 'phuong',
      address: '12 Nguyễn Huệ',
    });
  });

  it("RECORDS the applicant's own consent in the same transaction", async () => {
    // There must be no state where a partner exists without their signature —
    // which only holds if the acceptance shares this transaction.
    const { useCase, legalCalls } = harness();

    await useCase.execute(USER_ID, input(), CTX);

    expect(legalCalls).toEqual([
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        partnerId: PARTNER_ID,
        acceptedVersionIds: ['doc-v1'],
        requestedLocale: 'vi',
        requiredDocTypes: ['partner_terms'],
        ip: '203.0.113.9',
      },
    ]);
  });

  it('fails the application, and announces nothing, when the consent is rejected', async () => {
    // Server-side enforcement of the form's required tick, so the guarantee
    // holds for the API and not only for the browser. The rollback itself is
    // the transaction's job; what is assertable here is that the consent runs
    // BEFORE the event, so no downstream handler ever sees an unsigned partner.
    const { useCase, events } = harness({ legalError: new Error('LEGAL_CONSENT_REQUIRED') });

    await expect(useCase.execute(USER_ID, input(), CTX)).rejects.toThrow(
      'LEGAL_CONSENT_REQUIRED',
    );
    expect(events).toEqual([]);
  });

  it('makes the applicant a member with the Partner Owner role', async () => {
    // Otherwise they could not complete their own profile while waiting.
    const { useCase, members, assignments } = harness();

    await useCase.execute(USER_ID, input(), CTX);

    expect(members).toEqual([
      { tenantId: TENANT_ID, partnerId: PARTNER_ID, userId: USER_ID },
    ]);
    expect(assignments).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        userId: USER_ID,
        roleId: 'role-partner-owner',
      },
    ]);
  });

  it('RE-READS the partner so the answer carries the owner it just established', async () => {
    // The create read the row back before addMember ran, so its `owner` is
    // still null at that point.
    const { useCase, order } = harness();

    const result = await useCase.execute(USER_ID, input(), CTX);

    expect(result).toMatchObject({ owner: { userId: USER_ID } });
    expect(order.indexOf('addMember')).toBeLessThan(order.indexOf('closeTransaction'));
  });

  it('announces the application on the tenant transaction', async () => {
    const { useCase, tenantDb, events } = harness();

    await useCase.execute(USER_ID, input(), CTX);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(events).toEqual([
      { eventType: 'partner.applied', payload: { partnerId: PARTNER_ID, userId: USER_ID } },
    ]);
  });

  it("evicts the applicant's cached permissions AFTER the transaction", async () => {
    // Partner scope has to work on their very next request; invalidating inside
    // could refill the cache before the assignment commits.
    const { useCase, order } = harness();

    await useCase.execute(USER_ID, input(), CTX);

    expect(order.at(-1)).toBe(`invalidate:${USER_ID}`);
    expect(order.at(-2)).toBe('closeTransaction');
  });
});
