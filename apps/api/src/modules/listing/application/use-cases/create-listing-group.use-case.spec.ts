import { describe, expect, it } from 'vitest';
import type { CreateListingGroupInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import type { IListingTypeRepository } from '../../../catalog/domain/ports/listing-type-repository.port';
import {
  ListingGroupSlugTaken,
  ListingTypeNotGroupable,
} from '../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import { CreateListingGroupUseCase } from './create-listing-group.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

interface Options {
  listingType?: { structure: string } | null;
  slugTaken?: boolean;
}

function harness(options: Options = {}) {
  const created: Array<Record<string, unknown>> = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
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
    useCase: new CreateListingGroupUseCase(
      fakePort<IListingGroupRepository>({
        findBySlug: () =>
          Promise.resolve(
            options.slugTaken ? ({ id: 'group-existing' } as ListingGroupRecord) : null,
          ),
        create: (_tx, _tenantId, data) => {
          created.push(data as unknown as Record<string, unknown>);
          return Promise.resolve({ id: 'group-1', ...data } as unknown as ListingGroupRecord);
        },
      }),
      fakePort<IListingTypeRepository>({
        findById: () =>
          Promise.resolve(
            (options.listingType === undefined
              ? { id: 'type-1', structure: 'grouped' }
              : options.listingType) as never,
          ),
      }),
      fakeCollaborator<ResolveAdministrativeAddressUseCase>({
        execute: () =>
          Promise.resolve({
            province: { code: '79', name: 'TP. Hồ Chí Minh' },
            ward: { code: '26734', name: 'Phường Bến Nghé' },
          }),
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    created,
    events,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    partnerId: PARTNER_ID,
    listingTypeId: 'type-1',
    title: 'Khách sạn Biển Xanh',
    provinceCode: '79',
    wardCode: '26734',
    address: '12 Nguyễn Huệ',
    latitude: 10.77,
    longitude: 106.7,
    amenities: [],
    photos: [],
    ...overrides,
  }) as unknown as CreateListingGroupInput;

describe('CreateListingGroupUseCase', () => {
  it('refuses a listing type that does not exist', async () => {
    const { useCase, created } = harness({ listingType: null });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(ListingTypeNotFound);
    expect(created).toEqual([]);
  });

  it('refuses a listing type that is not groupable', async () => {
    // A standalone type has no items to hold; a post of one would be an empty
    // shell the reviewer can never approve.
    const { useCase, created } = harness({ listingType: { structure: 'standalone' } });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(
      ListingTypeNotGroupable,
    );
    expect(created).toEqual([]);
  });

  it('refuses a slug the tenant already uses', async () => {
    const { useCase, created } = harness({ slugTaken: true });

    await expect(useCase.execute(TENANT_ID, input({ slug: 'khach-san' }))).rejects.toBeInstanceOf(
      ListingGroupSlugTaken,
    );
    expect(created).toEqual([]);
  });

  it('derives a random-suffixed slug from the title when none is given', async () => {
    // Two posts with the same Vietnamese name must not collide on the tenant's
    // unique index.
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(created[0]?.slug).toMatch(/^khach-san-bien-xanh-[0-9a-f]{6}$/);
  });

  it('freezes the RESOLVED province and ward names, not the codes alone', async () => {
    // The storefront renders the name; resolving it once at creation is what keeps
    // a post readable without a join on every read.
    const { useCase, tenantDb, created, events } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      partnerId: PARTNER_ID,
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '26734',
      wardName: 'Phường Bến Nghé',
    });
    expect(events).toEqual([
      { eventType: 'listing_group.created', payload: { listingGroupId: 'group-1' } },
    ]);
  });

  it('normalises the optional text fields to null', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(created[0]).toMatchObject({ description: null, workingArea: null });
  });
});
