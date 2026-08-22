import { describe, expect, it } from 'vitest';
import type { UpdateListingInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import { PartnerNotFound } from '../../../../shared/domain/errors/partner-not-found';
import { InvalidAttributes } from '../../../catalog/domain/errors/listing-type-errors';
import type { IListingTypeRepository } from '../../../catalog/domain/ports/listing-type-repository.port';
import type { IPartnerRepository } from '../../../partner/domain/ports/partner-repository.port';
import type { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import { InvalidBookingModes } from '../../domain/errors/listing-errors';
import {
  InvalidListingAdministrativeDivision,
  ListingNotFound,
  ListingNotOwned,
  ListingSlugTaken,
  ListingStateChanged,
} from '../../domain/errors/listing-errors';
import {
  ListingGroupNotFound,
  ListingGroupNotOwned,
  ListingGroupTypeMismatch,
} from '../../domain/errors/listing-group-errors';
import { ListingPricingRejected } from '../../domain/errors/pricing-rule-errors';
import type { IListingGroupRepository } from '../../domain/ports/listing-group-repository.port';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import type { AssertListingDepositCoverageUseCase } from './assert-listing-deposit-coverage.use-case';
import { ApplyListingUpdateUseCase } from './apply-listing-update.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';
const TYPE_ID = 'type-1';
const UPDATED_AT = new Date('2026-08-01T10:00:00Z');

const stored = (overrides: Record<string, unknown> = {}): ListingRecord =>
  ({
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    listingTypeId: TYPE_ID,
    categoryId: 'cat-1',
    groupId: null,
    resourceId: 'resource-1',
    title: 'Sân bóng số 1',
    slug: 'san-bong-so-1',
    status: 'draft',
    publishedBy: null,
    bookingModes: ['hourly'],
    modeConfig: { hourly: { basePrice: '500000', minDuration: 1, maxDuration: 8 } },
    depositPercent: 100,
    updatedAt: UPDATED_AT,
    ...overrides,
  }) as unknown as ListingRecord;

const listingType = (overrides: Record<string, unknown> = {}) =>
  ({
    id: TYPE_ID,
    allowedModes: ['hourly', 'daily'],
    bookingSelection: 'flexible_duration',
    attributeSchema: [],
    requiresIdentityVerification: false,
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

const RESOLVED_ADDRESS = {
  province: { code: '79', name: 'TP. Hồ Chí Minh' },
  ward: { code: '26734', name: 'Phường Bến Nghé' },
};

interface Options {
  record?: ListingRecord | null;
  type?: unknown;
  partner?: unknown;
  group?: unknown;
  slugOwner?: { id: string } | null;
  /** `null` makes the optimistic update miss, as a concurrent write would. */
  updateResult?: ListingRecord | null;
  depositError?: Error;
}

function harness(options: Options = {}) {
  const updates: Array<{ id: string; expectedUpdatedAt: Date; patch: Record<string, unknown> }> = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const depositArgs: unknown[] = [];
  const reads: string[] = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  return {
    tx,
    useCase: new ApplyListingUpdateUseCase(
      fakePort<IListingRepository>({
        findById: () =>
          Promise.resolve(options.record === undefined ? stored() : options.record),
        findBySlug: (_tx, slug) => {
          reads.push(`findBySlug:${slug}`);
          return Promise.resolve((options.slugOwner ?? null) as never);
        },
        update: (_tx, id, expectedUpdatedAt, patch) => {
          updates.push({
            id,
            expectedUpdatedAt: expectedUpdatedAt as Date,
            patch: patch as unknown as Record<string, unknown>,
          });
          return Promise.resolve(
            options.updateResult === undefined
              ? ({ id, ...patch } as unknown as ListingRecord)
              : options.updateResult,
          );
        },
      }),
      fakePort<IListingGroupRepository>({
        findById: () => {
          reads.push('groupFindById');
          return Promise.resolve(options.group === undefined ? group() : (options.group as never));
        },
      }),
      fakePort<IListingTypeRepository>({
        findById: () => {
          reads.push('typeFindById');
          return Promise.resolve(
            options.type === undefined ? listingType() : (options.type as never),
          );
        },
      }),
      fakePort<IPartnerRepository>({
        findById: () =>
          Promise.resolve(
            options.partner === undefined
              ? ({ id: PARTNER_ID, isHouse: false } as never)
              : (options.partner as never),
          ),
      }),
      fakeCollaborator<ResolveAdministrativeAddressUseCase>({
        execute: () => {
          reads.push('resolveAddress');
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
      new OutboxService(),
    ),
    updates,
    events,
    depositArgs,
    reads,
  };
}

const input = (overrides: Record<string, unknown> = {}) => overrides as UpdateListingInput;

describe('ApplyListingUpdateUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase, tx, updates } = harness({ record: null });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' })),
    ).rejects.toBeInstanceOf(ListingNotFound);
    expect(updates).toEqual([]);
  });

  it("refuses a partner-scoped caller editing another partner's listing", async () => {
    const { useCase, tx, updates } = harness();

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' }), {
        requirePartnerId: 'partner-2',
      }),
    ).rejects.toBeInstanceOf(ListingNotOwned);
    expect(updates).toEqual([]);
  });

  it('lets a caller with NO partner scope through — that is the reviewer path', async () => {
    // Approval applies a parked edit on the partner's behalf, so it deliberately
    // passes no partner id.
    const { useCase, tx, updates } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' }));

    expect(updates).toHaveLength(1);
  });

  it('refuses a half-supplied address instead of writing a mismatched pair', async () => {
    // A ward belongs to exactly one province; taking one without the other would
    // leave the listing pointing at a ward outside its own province.
    const { useCase, tx, updates } = harness();

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ provinceCode: '79' })),
    ).rejects.toBeInstanceOf(InvalidListingAdministrativeDivision);
    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ wardCode: '26734' })),
    ).rejects.toBeInstanceOf(InvalidListingAdministrativeDivision);
    expect(updates).toEqual([]);
  });

  it('writes the RESOLVED names when both codes are supplied', async () => {
    const { useCase, tx, updates } = harness();

    await useCase.execute(
      tx,
      TENANT_ID,
      LISTING_ID,
      input({ provinceCode: '79', wardCode: '26734' }),
    );

    expect(updates[0]?.patch).toMatchObject({
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '26734',
      wardName: 'Phường Bến Nghé',
    });
  });

  it('leaves the address untouched when the patch does not mention it', async () => {
    // `undefined` is what tells Prisma "do not set" — a resolved-but-empty
    // address would blank the columns on every unrelated edit.
    const { useCase, tx, updates, reads } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' }));

    expect(reads).not.toContain('resolveAddress');
    expect(updates[0]?.patch).toMatchObject({
      provinceCode: undefined,
      provinceName: undefined,
      wardCode: undefined,
      wardName: undefined,
    });
  });

  it('refuses a slug another listing already holds', async () => {
    const { useCase, tx, updates } = harness({ slugOwner: { id: 'listing-2' } });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ slug: 'san-bong-so-2' })),
    ).rejects.toBeInstanceOf(ListingSlugTaken);
    expect(updates).toEqual([]);
  });

  it('accepts the slug row that IS this listing', async () => {
    // A re-save of an unchanged-looking patch must not collide with itself.
    const { useCase, tx, updates } = harness({ slugOwner: { id: LISTING_ID } });

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ slug: 'san-bong-so-2' }));

    expect(updates).toHaveLength(1);
  });

  it('does not look up the slug when it did not change', async () => {
    const { useCase, tx, reads } = harness({ slugOwner: { id: 'listing-2' } });

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ slug: 'san-bong-so-1' }));

    expect(reads).not.toContain('findBySlug:san-bong-so-1');
  });

  it('checks deposit coverage when the deposit percent changes', async () => {
    const { useCase, tx, depositArgs } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ depositPercent: 20 }));

    expect(depositArgs).toEqual([
      {
        target: {
          partnerId: PARTNER_ID,
          listingTypeId: TYPE_ID,
          categoryId: 'cat-1',
          isHouse: false,
        },
        depositPercent: 20,
      },
    ]);
  });

  it('re-checks coverage against the NEW category, keeping the stored deposit', async () => {
    // Moving category can move the listing under a stricter commission rule, so
    // an unchanged deposit can stop being enough.
    const { useCase, tx, depositArgs } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ categoryId: 'cat-9' }));

    expect(depositArgs).toEqual([
      {
        target: {
          partnerId: PARTNER_ID,
          listingTypeId: TYPE_ID,
          categoryId: 'cat-9',
          isHouse: false,
        },
        depositPercent: 100,
      },
    ]);
  });

  it('treats clearing the category as a coverage change too', async () => {
    const { useCase, tx, depositArgs } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ categoryId: null }));

    expect(depositArgs).toEqual([
      {
        target: {
          partnerId: PARTNER_ID,
          listingTypeId: TYPE_ID,
          categoryId: null,
          isHouse: false,
        },
        depositPercent: 100,
      },
    ]);
  });

  it("carries the partner's house flag into the coverage check", async () => {
    // House partners bypass the commission-rule floor entirely, so a hardcoded
    // `false` would impose a minimum deposit the platform's own listings do not
    // have.
    const { useCase, tx, depositArgs } = harness({
      partner: { id: PARTNER_ID, isHouse: true },
    });

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ depositPercent: 0 }));

    expect(depositArgs).toEqual([
      {
        target: {
          partnerId: PARTNER_ID,
          listingTypeId: TYPE_ID,
          categoryId: 'cat-1',
          isHouse: true,
        },
        depositPercent: 0,
      },
    ]);
  });

  it('skips the coverage check entirely for an edit that touches neither', async () => {
    // It costs a partner read plus a commission-rule read; a title edit needs
    // neither.
    const { useCase, tx, depositArgs } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' }));

    expect(depositArgs).toEqual([]);
  });

  it('answers not-found when the listing points at a missing partner', async () => {
    const { useCase, tx, updates } = harness({ partner: null });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ depositPercent: 20 })),
    ).rejects.toBeInstanceOf(PartnerNotFound);
    expect(updates).toEqual([]);
  });

  it('lets a deposit-coverage rejection through instead of updating anyway', async () => {
    const { useCase, tx, updates } = harness({ depositError: new Error('deposit too low') });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ depositPercent: 5 })),
    ).rejects.toThrow('deposit too low');
    expect(updates).toEqual([]);
  });

  it('answers not-found when the listing already sits in a group that vanished', async () => {
    // The stored binding is re-read even when the patch does not touch it, so a
    // dangling group id surfaces rather than being written forward.
    const { useCase, tx, updates } = harness({
      record: stored({ groupId: 'group-1' }),
      group: null,
    });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' })),
    ).rejects.toBeInstanceOf(ListingGroupNotFound);
    expect(updates).toEqual([]);
  });

  it("refuses to move a listing under ANOTHER partner's post", async () => {
    const { useCase, tx, updates } = harness({ group: group({ partnerId: 'partner-2' }) });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ groupId: 'group-1' })),
    ).rejects.toBeInstanceOf(ListingGroupNotOwned);
    expect(updates).toEqual([]);
  });

  it('refuses a post built for a different listing type', async () => {
    const { useCase, tx, updates } = harness({ group: group({ listingTypeId: 'type-2' }) });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ groupId: 'group-1' })),
    ).rejects.toBeInstanceOf(ListingGroupTypeMismatch);
    expect(updates).toEqual([]);
  });

  it('allows UNBINDING from a post without any ownership check', async () => {
    // `null` detaches; there is no incoming post to own.
    const { useCase, tx, updates, reads } = harness({
      record: stored({ groupId: 'group-1' }),
      group: group({ partnerId: 'partner-2' }),
    });

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ groupId: null }));

    expect(updates[0]?.patch).toMatchObject({ groupId: null });
    expect(reads).not.toContain('groupFindById');
  });

  it('re-validates attributes against the type as it exists NOW', async () => {
    // A parked edit is approved later, so the type may have gained a required
    // field since the partner submitted it.
    const { useCase, tx, updates } = harness({
      type: listingType({
        attributeSchema: [{ key: 'surface', label: 'Mặt sân', type: 'text', required: true }],
      }),
    });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ attributes: {} })),
    ).rejects.toBeInstanceOf(InvalidAttributes);
    expect(updates).toEqual([]);
  });

  it('answers not-found when the type behind the listing has gone', async () => {
    const { useCase, tx } = harness({ type: null });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ attributes: {} })),
    ).rejects.toBeInstanceOf(ListingTypeNotFound);
  });

  it('refuses booking modes the type does not allow', async () => {
    // Naming the modes matters: without this gate the request still fails, but
    // as "daily is missing its config" — which tells the partner to send one for
    // a mode this type will never accept.
    const { useCase, tx, updates } = harness({ type: listingType({ allowedModes: ['hourly'] }) });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ bookingModes: ['daily'] })),
    ).rejects.toBeInstanceOf(InvalidBookingModes);
    expect(updates).toEqual([]);
  });

  it('validates a new mode against the STORED mode config', async () => {
    // Enabling `daily` without sending its config must fail — the patch is
    // merged with what is stored, not read in isolation.
    const { useCase, tx } = harness();

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ bookingModes: ['hourly', 'daily'] })),
    ).rejects.toMatchObject({
      constructor: ListingPricingRejected,
      code: 'MISSING_MODE_CONFIG',
    });
  });

  it('validates a new mode config against the STORED booking modes', async () => {
    const { useCase, tx } = harness();

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ modeConfig: { daily: {} } })),
    ).rejects.toMatchObject({
      constructor: ListingPricingRejected,
      code: 'MISSING_MODE_CONFIG',
    });
  });

  it('honours the bookable validation context the reviewer path asks for', async () => {
    // A draft may omit its packages; publishing may not.
    const type = listingType({ bookingSelection: 'fixed_packages' });
    const asDraft = harness({ type });
    await asDraft.useCase.execute(
      asDraft.tx,
      TENANT_ID,
      LISTING_ID,
      input({ modeConfig: { hourly: {} } }),
      { modeConfigValidation: 'draft' },
    );
    expect(asDraft.updates).toHaveLength(1);

    const asBookable = harness({ type });
    await expect(
      asBookable.useCase.execute(
        asBookable.tx,
        TENANT_ID,
        LISTING_ID,
        input({ modeConfig: { hourly: {} } }),
        { modeConfigValidation: 'bookable' },
      ),
    ).rejects.toMatchObject({ code: 'PACKAGE_CONFIG_REQUIRED' });
  });

  it('skips the type read for an edit that touches none of the three', async () => {
    const { useCase, tx, reads } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' }));

    expect(reads).not.toContain('typeFindById');
  });

  it('re-normalizes the STORED config when only the modes are patched', async () => {
    // Nothing about the config was sent, so it can only come from the stored
    // row — and the re-normalized value is what gets written, otherwise a
    // modes-only edit would leave the column untouched and out of step.
    const { useCase, tx, updates } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ bookingModes: ['hourly'] }));

    // The defaults the normalizer fills in — `packages`, `granularity`,
    // `leadTimeMin` — are the proof the written value came through it rather
    // than straight from the stored row.
    expect(updates[0]?.patch.modeConfig).toEqual({
      hourly: {
        basePrice: '500000',
        minDuration: 1,
        maxDuration: 8,
        granularity: 60,
        leadTimeMin: 0,
        packages: [],
      },
    });
  });

  it('writes the NORMALIZED mode config, not the raw patch', async () => {
    const { useCase, tx, updates } = harness();

    await useCase.execute(
      tx,
      TENANT_ID,
      LISTING_ID,
      input({ modeConfig: { hourly: { basePrice: '600000', minDuration: 2, maxDuration: 6 } } }),
    );

    expect(updates[0]?.patch.modeConfig).toMatchObject({
      hourly: { basePrice: '600000', minDuration: 2, maxDuration: 6 },
    });
  });

  it('guards the write with the version it read', async () => {
    // The row was read at the top of a caller-owned transaction; a concurrent
    // write between the read and this update must lose.
    const { useCase, tx, updates } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' }));

    expect(updates[0]).toMatchObject({ id: LISTING_ID, expectedUpdatedAt: UPDATED_AT });
  });

  it('reports the conflict when the optimistic update matched nothing', async () => {
    const { useCase, tx, events } = harness({ updateResult: null });

    await expect(
      useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' })),
    ).rejects.toBeInstanceOf(ListingStateChanged);
    expect(events).toEqual([]);
  });

  it("announces the update on the CALLER's transaction", async () => {
    // It opens none of its own — approval has to apply the payload and close the
    // revision atomically.
    const { useCase, tx, events } = harness();

    await useCase.execute(tx, TENANT_ID, LISTING_ID, input({ title: 'Mới' }));

    expect(events).toEqual([
      { eventType: 'listing.updated', payload: { listingId: LISTING_ID } },
    ]);
  });
});
