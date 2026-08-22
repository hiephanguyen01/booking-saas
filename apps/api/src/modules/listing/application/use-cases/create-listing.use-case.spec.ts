import { describe, expect, it } from 'vitest';
import type { CreateListingInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { DEFAULT_TIMEZONE } from '../../../../shared/time/time';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import { PartnerNotFound } from '../../../../shared/domain/errors/partner-not-found';
import { InvalidAttributes } from '../../../catalog/domain/errors/listing-type-errors';
import type { IListingTypeRepository } from '../../../catalog/domain/ports/listing-type-repository.port';
import { PartnerNotVerified } from '../../../partner/domain/errors/partner-errors';
import type { IPartnerRepository } from '../../../partner/domain/ports/partner-repository.port';
import type { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import {
  ListingSlugTaken,
  ResourceNotFound,
  ResourceNotOwned,
} from '../../domain/errors/listing-errors';
import {
  ListingGroupNotFound,
  ListingGroupNotOwned,
  ListingGroupReadOnlyForEdit,
  ListingGroupTypeMismatch,
} from '../../domain/errors/listing-group-errors';
import { ListingPricingRejected } from '../../domain/errors/pricing-rule-errors';
import type { IListingGroupRepository } from '../../domain/ports/listing-group-repository.port';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import type { IResourceRepository, ResourceRecord } from '../../domain/ports/resource-repository.port';
import type { AssertListingDepositCoverageUseCase } from './assert-listing-deposit-coverage.use-case';
import { CreateListingUseCase } from './create-listing.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const TYPE_ID = 'type-1';

const listingType = (overrides: Record<string, unknown> = {}) =>
  ({
    id: TYPE_ID,
    allowedModes: ['hourly', 'daily'],
    bookingSelection: 'flexible_duration',
    attributeSchema: [],
    requiresIdentityVerification: false,
    ...overrides,
  }) as never;

const partner = (overrides: Record<string, unknown> = {}) =>
  ({
    id: PARTNER_ID,
    verificationStatus: 'verified',
    isHouse: false,
    ...overrides,
  }) as never;

const group = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'group-1',
    partnerId: PARTNER_ID,
    listingTypeId: TYPE_ID,
    status: 'draft',
    ...overrides,
  }) as never;

const resource = (overrides: Record<string, unknown> = {}): ResourceRecord =>
  ({
    id: 'resource-shared',
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    name: 'Shared court',
    timezone: 'Asia/Ho_Chi_Minh',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as unknown as ResourceRecord;

const RESOLVED_ADDRESS = {
  province: { code: '79', name: 'TP. Hồ Chí Minh' },
  ward: { code: '26734', name: 'Phường Bến Nghé' },
};

interface Options {
  slugTaken?: boolean;
  type?: unknown;
  partner?: unknown;
  group?: unknown;
  existingResource?: ResourceRecord | null;
  tenantTimezone?: string | null;
  /** Thrown by the deposit-coverage gate when set. */
  depositError?: Error;
}

function harness(options: Options = {}) {
  const calls: string[] = [];
  const created: Array<Record<string, unknown>> = [];
  const createdResources: Array<Record<string, unknown>> = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const depositArgs: unknown[] = [];
  const tx = fakeTx({
    tenant: {
      findUnique: () =>
        Promise.resolve(
          options.tenantTimezone === null
            ? null
            : { defaultTimezone: options.tenantTimezone ?? 'Asia/Bangkok' },
        ),
    },
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, onOpen: () => calls.push('openTransaction') });
  return {
    useCase: new CreateListingUseCase(
      fakePort<IListingRepository>({
        findBySlug: (_tx, slug) => {
          calls.push(`findBySlug:${slug}`);
          return Promise.resolve(options.slugTaken ? ({ id: 'other' } as never) : null);
        },
        create: (_tx, _tenantId, data) => {
          created.push(data as unknown as Record<string, unknown>);
          return Promise.resolve({ id: 'listing-new', ...data } as unknown as ListingRecord);
        },
      }),
      fakePort<IResourceRepository>({
        findById: () =>
          Promise.resolve(
            options.existingResource === undefined ? resource() : options.existingResource,
          ),
        create: (_tx, _tenantId, data) => {
          createdResources.push(data as unknown as Record<string, unknown>);
          return Promise.resolve(resource({ id: 'resource-auto', ...data }));
        },
      }),
      fakePort<IListingGroupRepository>({
        findById: () => Promise.resolve(options.group === undefined ? group() : (options.group as never)),
      }),
      fakePort<IListingTypeRepository>({
        findById: () => Promise.resolve(options.type === undefined ? listingType() : (options.type as never)),
      }),
      fakePort<IPartnerRepository>({
        findById: () =>
          Promise.resolve(options.partner === undefined ? partner() : (options.partner as never)),
      }),
      fakeCollaborator<ResolveAdministrativeAddressUseCase>({
        execute: () => {
          calls.push('resolveAddress');
          return Promise.resolve(RESOLVED_ADDRESS);
        },
      }),
      fakeCollaborator<AssertListingDepositCoverageUseCase>({
        execute: (_tx: unknown, target: unknown, depositPercent: unknown) => {
          depositArgs.push({ target, depositPercent });
          return options.depositError
            ? Promise.reject(options.depositError)
            : Promise.resolve(undefined);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    calls,
    created,
    createdResources,
    events,
    depositArgs,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    partnerId: PARTNER_ID,
    listingTypeId: TYPE_ID,
    title: 'Sân bóng số 1',
    slug: 'san-bong-so-1',
    photos: [],
    attributes: {},
    bookingModes: ['hourly'],
    modeConfig: { hourly: { basePrice: '500000', minDuration: 1, maxDuration: 8 } },
    provinceCode: '79',
    wardCode: '26734',
    address: '12 Nguyễn Huệ',
    latitude: 10.77,
    longitude: 106.7,
    bufferBefore: 0,
    bufferAfter: 0,
    approvalRequired: false,
    depositPercent: 100,
    balanceDue: 'online_before',
    ...overrides,
  }) as unknown as CreateListingInput;

describe('CreateListingUseCase', () => {
  it('refuses a slug another listing already holds', async () => {
    const { useCase, created } = harness({ slugTaken: true });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(ListingSlugTaken);
    expect(created).toEqual([]);
  });

  it('GENERATES a slug when none was supplied, and checks that one for collisions', async () => {
    // The generated slug is what the storefront URL becomes, so it has to be the
    // value the uniqueness check saw — not a second, unchecked one. The title is
    // transliterated, so no diacritic ever reaches the URL.
    const { useCase, created, calls } = harness();

    await useCase.execute(TENANT_ID, input({ slug: undefined }));

    const slug = created[0]?.slug as string;
    expect(slug).toMatch(/^san-bong-so-1-[0-9a-f]{6}$/);
    expect(calls).toContain(`findBySlug:${slug}`);
  });

  it('falls back to a Vietnamese base when the title has nothing sluggable', async () => {
    // An emoji-only or CJK title normalises to the empty string; `tin-dang` is
    // what keeps the URL readable instead of a bare random code.
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ slug: undefined, title: '体育館' }));

    expect(created[0]?.slug).toMatch(/^tin-dang-[0-9a-f]{6}$/);
  });

  it('resolves the address BEFORE opening the tenant transaction', async () => {
    // The division lookup is not tenant-scoped; doing it inside would hold an
    // interactive transaction open across it on every create.
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(calls.slice(0, 2)).toEqual(['resolveAddress', 'openTransaction']);
  });

  it('stores the RESOLVED province and ward names, not the codes it was given', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(created[0]).toMatchObject({
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '26734',
      wardName: 'Phường Bến Nghé',
    });
  });

  it('answers not-found for a listing type this tenant does not have', async () => {
    const { useCase, created } = harness({ type: null });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(ListingTypeNotFound);
    expect(created).toEqual([]);
  });

  it('refuses a booking mode the type does not allow', async () => {
    const { useCase, created } = harness({ type: listingType({ allowedModes: ['daily'] }) });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toThrow();
    expect(created).toEqual([]);
  });

  it("refuses attributes that do not match the type's schema", async () => {
    const { useCase, created } = harness({
      type: listingType({
        attributeSchema: [{ key: 'surface', label: 'Mặt sân', type: 'text', required: true }],
      }),
    });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(InvalidAttributes);
    expect(created).toEqual([]);
  });

  it('translates a mode-config rejection into the listing pricing error', async () => {
    // The pricing kernel is shared, so its error type means nothing to an HTTP
    // client — the code has to survive the translation.
    const { useCase, created } = harness();

    await expect(
      useCase.execute(TENANT_ID, input({ modeConfig: { hourly: { basePrice: '500000' } } })),
    ).rejects.toMatchObject({
      constructor: ListingPricingRejected,
      code: 'FLEXIBLE_PRICE_CONFIG_REQUIRED',
    });
    expect(created).toEqual([]);
  });

  it('answers not-found for a partner this tenant does not have', async () => {
    const { useCase, created } = harness({ partner: null });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(PartnerNotFound);
    expect(created).toEqual([]);
  });

  it('blocks an unverified partner from a type that requires identity verification', async () => {
    const { useCase, created } = harness({
      type: listingType({ requiresIdentityVerification: true }),
      partner: partner({ verificationStatus: 'pending' }),
    });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(PartnerNotVerified);
    expect(created).toEqual([]);
  });

  it('lets an unverified partner create where the type does not demand verification', async () => {
    const { useCase, created } = harness({ partner: partner({ verificationStatus: 'pending' }) });

    await useCase.execute(TENANT_ID, input());

    expect(created).toHaveLength(1);
  });

  it("puts the partner's house flag and the listing's category into the deposit check", async () => {
    // The minimum deposit comes from the commission rule that matches this
    // type/category, and house partners bypass it — passing the wrong target
    // would silently apply another rule's floor.
    const { useCase, depositArgs } = harness({ partner: partner({ isHouse: true }) });

    await useCase.execute(TENANT_ID, input({ categoryId: 'cat-9', depositPercent: 30 }));

    expect(depositArgs).toEqual([
      {
        target: {
          partnerId: PARTNER_ID,
          listingTypeId: TYPE_ID,
          categoryId: 'cat-9',
          isHouse: true,
        },
        depositPercent: 30,
      },
    ]);
  });

  it('lets a deposit-coverage rejection through instead of creating anyway', async () => {
    const { useCase, created } = harness({ depositError: new Error('deposit too low') });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toThrow('deposit too low');
    expect(created).toEqual([]);
  });

  it('answers not-found for a group this tenant does not have', async () => {
    const { useCase, created } = harness({ group: null });

    await expect(
      useCase.execute(TENANT_ID, input({ groupId: 'group-1' })),
    ).rejects.toBeInstanceOf(ListingGroupNotFound);
    expect(created).toEqual([]);
  });

  it("refuses to attach a listing to ANOTHER partner's post", async () => {
    // A post and its children share one owner — otherwise partner A would be
    // publishing inside partner B's post.
    const { useCase, created } = harness({ group: group({ partnerId: 'partner-2' }) });

    await expect(
      useCase.execute(TENANT_ID, input({ groupId: 'group-1' })),
    ).rejects.toBeInstanceOf(ListingGroupNotOwned);
    expect(created).toEqual([]);
  });

  it('refuses a group built for a different listing type', async () => {
    const { useCase, created } = harness({ group: group({ listingTypeId: 'type-2' }) });

    await expect(
      useCase.execute(TENANT_ID, input({ groupId: 'group-1' })),
    ).rejects.toBeInstanceOf(ListingGroupTypeMismatch);
    expect(created).toEqual([]);
  });

  it('refuses to add an item to a LIVE post', async () => {
    // Items may only move while the post is not live; a published post would
    // otherwise gain a child the tenant never reviewed.
    const { useCase, created } = harness({ group: group({ status: 'published' }) });

    await expect(
      useCase.execute(TENANT_ID, input({ groupId: 'group-1' })),
    ).rejects.toBeInstanceOf(ListingGroupReadOnlyForEdit);
    expect(created).toEqual([]);
  });

  it('accepts an archived post, because hiding is what the error tells partners to do', async () => {
    const { useCase, created } = harness({ group: group({ status: 'archived' }) });

    await useCase.execute(TENANT_ID, input({ groupId: 'group-1' }));

    expect(created[0]).toMatchObject({ groupId: 'group-1' });
  });

  it('answers not-found for a resource this tenant does not have', async () => {
    const { useCase, created } = harness({ existingResource: null });

    await expect(
      useCase.execute(TENANT_ID, input({ resourceId: 'resource-shared' })),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    expect(created).toEqual([]);
  });

  it("refuses another partner's shared calendar resource", async () => {
    // Attaching it would let this partner read and block the other's calendar.
    const { useCase, created } = harness({
      existingResource: resource({ partnerId: 'partner-2' }),
    });

    await expect(
      useCase.execute(TENANT_ID, input({ resourceId: 'resource-shared' })),
    ).rejects.toBeInstanceOf(ResourceNotOwned);
    expect(created).toEqual([]);
  });

  it('reuses a shared resource instead of creating a second one', async () => {
    const { useCase, created, createdResources } = harness();

    await useCase.execute(TENANT_ID, input({ resourceId: 'resource-shared' }));

    expect(createdResources).toEqual([]);
    expect(created[0]).toMatchObject({ resourceId: 'resource-shared' });
  });

  it("auto-creates a 1:1 resource in the TENANT's timezone", async () => {
    // A hardcoded zone would put every non-VN tenant's calendar hours in the
    // wrong place.
    const { useCase, created, createdResources } = harness({ tenantTimezone: 'Asia/Bangkok' });

    await useCase.execute(TENANT_ID, input());

    expect(createdResources).toEqual([
      { partnerId: PARTNER_ID, name: 'Sân bóng số 1', timezone: 'Asia/Bangkok' },
    ]);
    expect(created[0]).toMatchObject({ resourceId: 'resource-auto' });
  });

  it('falls back to the platform default zone when the tenant row is missing', async () => {
    const { useCase, createdResources } = harness({ tenantTimezone: null });

    await useCase.execute(TENANT_ID, input());

    expect(createdResources[0]).toMatchObject({ timezone: DEFAULT_TIMEZONE });
  });

  it('announces the listing inside the tenant transaction', async () => {
    const { useCase, tenantDb, events } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(events).toEqual([
      { eventType: 'listing.created', payload: { listingId: 'listing-new' } },
    ]);
  });

  it('defaults the optional relations to null rather than leaving them undefined', async () => {
    // These columns are nullable, and Prisma treats `undefined` as "do not set" —
    // which on create silently drops the field instead of writing NULL.
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(created[0]).toMatchObject({
      groupId: null,
      categoryId: null,
      description: null,
      stockQuantity: null,
      capacity: null,
      cancellationPolicyId: null,
    });
  });
});
