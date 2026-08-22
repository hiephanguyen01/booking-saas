import { describe, expect, it } from 'vitest';
import type { AvailabilityQuery } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import { ListingNotFound } from '../../../../shared/domain/errors/listing-not-found';
import { ModeNotEnabled } from '../../../../shared/domain/errors/mode-not-enabled';
import type { Interval } from '../../../../shared/domain/availability/interval';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type {
  IListingRepository,
  PublicListingRecord,
} from '../../../listing/domain/ports/listing-repository.port';
import type { IPricingRuleRepository } from '../../../listing/domain/ports/pricing-rule-repository.port';
import { ListingPricingRejected } from '../../../listing/domain/errors/pricing-rule-errors';
import type {
  CachedSlot,
  IAvailabilityCache,
} from '../../domain/ports/availability-cache.port';
import type { IAvailabilityExceptionRepository } from '../../domain/ports/availability-exception-repository.port';
import type { IAvailabilityRuleRepository } from '../../domain/ports/availability-rule-repository.port';
import type { IBusyReader } from '../../domain/ports/busy-reader.port';
import type { IHoldReader } from '../../domain/ports/hold-reader.port';
import { GetAvailabilityUseCase } from './get-availability.use-case';

const HOST = 'studiohub.vn';
const SLUG = 'san-bong-so-1';
const TZ = 'Asia/Ho_Chi_Minh';

const listing = (overrides: Record<string, unknown> = {}): PublicListingRecord =>
  ({
    id: 'listing-1',
    resourceId: 'resource-1',
    resourceTimezone: TZ,
    bookingModes: ['hourly', 'daily', 'inventory'],
    bookingSelection: 'flexible_duration',
    depositPercent: 100,
    bufferBefore: 0,
    bufferAfter: 0,
    stockQuantity: null,
    modeConfig: {
      hourly: { basePrice: '500000', minDuration: 1, maxDuration: 4, granularity: 60, leadTimeMin: 0 },
      daily: { basePricePerNight: '2000000', checkinTime: '14:00', checkoutTime: '12:00' },
    },
    ...overrides,
  }) as unknown as PublicListingRecord;

const OPEN_ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  id: `rule-${dayOfWeek}`,
  listingId: 'listing-1',
  dayOfWeek,
  openTime: '08:00',
  closeTime: '18:00',
}));

interface Options {
  listing?: PublicListingRecord | null;
  rules?: typeof OPEN_ALL_WEEK;
  exceptions?: Array<Record<string, unknown>>;
  busy?: Interval[];
  holds?: Interval[];
  inventoryUsed?: number;
  cached?: CachedSlot[] | null;
}

function harness(options: Options = {}) {
  const cacheReads: Array<{ listingId: string; date: string; selectionKey: string }> = [];
  const cacheWrites: Array<{ resourceId: string; date: string; slots: CachedSlot[] }> = [];
  const busyCalls: Array<{ resourceId: string; from: Date; to: Date }> = [];
  const holdCalls: Array<{ resourceId: string }> = [];
  const inventoryCalls: Array<{ listingId: string; from: Date; to: Date }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetAvailabilityUseCase(
      fakePort<IListingRepository>({
        findPublicBySlug: () =>
          Promise.resolve(options.listing === undefined ? listing() : options.listing),
      }),
      fakePort<IPricingRuleRepository>({ listByListing: () => Promise.resolve([]) }),
      fakePort<IAvailabilityRuleRepository>({
        listByListing: () => Promise.resolve((options.rules ?? OPEN_ALL_WEEK) as never),
      }),
      fakePort<IAvailabilityExceptionRepository>({
        listByResource: () => Promise.resolve((options.exceptions ?? []) as never),
      }),
      fakePort<IBusyReader>({
        busyBookings: (_tx, resourceId, from, to) => {
          busyCalls.push({ resourceId, from, to });
          return Promise.resolve(options.busy ?? []);
        },
        inventoryUsage: (_tx, listingId, from, to) => {
          inventoryCalls.push({ listingId, from, to });
          return Promise.resolve(options.inventoryUsed ?? 0);
        },
      }),
      fakePort<IHoldReader>({
        activeHolds: (resourceId) => {
          holdCalls.push({ resourceId });
          return Promise.resolve(options.holds ?? []);
        },
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: 'tenant-9' }),
      }),
      tenantDb.service,
      fakePort<IAvailabilityCache>({
        get: (listingId, date, selectionKey) => {
          cacheReads.push({ listingId, date, selectionKey });
          return Promise.resolve(options.cached === undefined ? null : options.cached);
        },
        set: (resourceId, _listingId, date, _key, slots) => {
          cacheWrites.push({ resourceId, date, slots });
          return Promise.resolve();
        },
      }),
    ),
    tenantDb,
    cacheReads,
    cacheWrites,
    busyCalls,
    holdCalls,
    inventoryCalls,
  };
}

const query = (overrides: Partial<AvailabilityQuery> = {}) =>
  ({
    mode: 'hourly',
    from: '2026-09-10',
    to: '2026-09-10',
    ...overrides,
  }) as AvailabilityQuery;

describe('GetAvailabilityUseCase', () => {
  it('answers not-found for an unknown listing', async () => {
    const { useCase } = harness({ listing: null });

    await expect(useCase.execute(HOST, SLUG, query())).rejects.toBeInstanceOf(ListingNotFound);
  });

  it('refuses a mode the listing does not offer', async () => {
    const { useCase } = harness({ listing: listing({ bookingModes: ['daily'] }) });

    await expect(useCase.execute(HOST, SLUG, query())).rejects.toBeInstanceOf(ModeNotEnabled);
  });

  it('resolves the tenant from the host and reads inside its scope', async () => {
    const { useCase, tenantDb } = harness();

    const result = await useCase.execute(HOST, SLUG, query());

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(result.timezone).toBe(TZ);
  });

  it('reports INVENTORY as stock minus what is committed', async () => {
    const { useCase } = harness({
      listing: listing({ stockQuantity: 10 }),
      inventoryUsed: 4,
    });

    await expect(
      useCase.execute(HOST, SLUG, query({ mode: 'inventory' })),
    ).resolves.toEqual({
      mode: 'inventory',
      timezone: TZ,
      inventory: { stock: 10, remaining: 6 },
    });
  });

  it('FLOORS remaining inventory at zero when more is committed than held', async () => {
    // Oversell can happen through a manual adjustment; a negative number on the
    // storefront reads as nonsense.
    const { useCase } = harness({ listing: listing({ stockQuantity: 2 }), inventoryUsed: 5 });

    await expect(
      useCase.execute(HOST, SLUG, query({ mode: 'inventory' })),
    ).resolves.toMatchObject({ inventory: { stock: 2, remaining: 0 } });
  });

  it('treats an absent stock quantity as zero', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(HOST, SLUG, query({ mode: 'inventory' })),
    ).resolves.toMatchObject({ inventory: { stock: 0, remaining: 0 } });
  });

  it('measures inventory over the WHOLE last day, not up to its midnight', async () => {
    // A one-day window ending at 00:00 would miss everything booked that day.
    const { useCase, inventoryCalls } = harness({ listing: listing({ stockQuantity: 1 }) });

    await useCase.execute(HOST, SLUG, query({ mode: 'inventory', from: '2026-09-10', to: '2026-09-10' }));

    expect(inventoryCalls[0]?.from.toISOString()).toBe('2026-09-09T17:00:00.000Z');
    expect(inventoryCalls[0]?.to.toISOString()).toBe('2026-09-10T17:00:00.000Z');
  });

  it('generates and CACHES hourly slots on a miss', async () => {
    const { useCase, cacheWrites, cacheReads } = harness({ cached: null });

    const result = await useCase.execute(HOST, SLUG, query());

    expect(cacheReads).toEqual([
      { listingId: 'listing-1', date: '2026-09-10', selectionKey: 'flexible' },
    ]);
    expect(cacheWrites[0]).toMatchObject({ resourceId: 'resource-1', date: '2026-09-10' });
    expect(result).toMatchObject({ mode: 'hourly' });
    expect((result as { days: unknown[] }).days).toHaveLength(1);
  });

  it('reads bookings ONCE for the range, not once per date', async () => {
    // The busy set is resource-scoped, so a query per day would multiply the
    // cost of a month view for nothing.
    const { useCase, busyCalls } = harness({ cached: null });

    await useCase.execute(HOST, SLUG, query({ from: '2026-09-10', to: '2026-09-13' }));

    expect(busyCalls).toHaveLength(1);
  });

  it('spends NO booking query when every date is cached', async () => {
    const { useCase, busyCalls, cacheWrites } = harness({ cached: [] });

    await useCase.execute(HOST, SLUG, query({ from: '2026-09-10', to: '2026-09-13' }));

    expect(busyCalls).toEqual([]);
    expect(cacheWrites).toEqual([]);
  });

  it('reads live holds FRESH on every request, cached or not', async () => {
    // Holds live in Redis and expire on their own; caching them would leave a
    // ghost-busy slot behind an expired one.
    const { useCase, holdCalls } = harness({ cached: [] });

    await useCase.execute(HOST, SLUG, query());

    expect(holdCalls).toEqual([{ resourceId: 'resource-1' }]);
  });

  it('MERGES a live hold on top of a cached available slot', async () => {
    const cached: CachedSlot[] = [
      {
        startUtc: '2026-09-10T01:00:00.000Z',
        endUtc: '2026-09-10T02:00:00.000Z',
        available: true,
        price: '500000',
      },
    ];
    const { useCase } = harness({
      cached,
      holds: [
        {
          start: new Date('2026-09-10T01:00:00.000Z'),
          end: new Date('2026-09-10T02:00:00.000Z'),
        },
      ],
    });

    const result = (await useCase.execute(HOST, SLUG, query())) as {
      days: Array<{ slots: Array<{ available: boolean }> }>;
    };

    expect(result.days[0]?.slots[0]?.available).toBe(false);
  });

  it('leaves a cached slot alone when no hold touches it', async () => {
    const cached: CachedSlot[] = [
      {
        startUtc: '2026-09-10T01:00:00.000Z',
        endUtc: '2026-09-10T02:00:00.000Z',
        available: true,
        price: '500000',
      },
    ];
    const { useCase } = harness({ cached });

    const result = (await useCase.execute(HOST, SLUG, query())) as {
      days: Array<{ slots: Array<{ available: boolean; price: string }> }>;
    };

    expect(result.days[0]?.slots[0]).toMatchObject({ available: true, price: '500000' });
  });

  it('answers one day per date in the range', async () => {
    const { useCase } = harness({ cached: [] });

    const result = (await useCase.execute(
      HOST,
      SLUG,
      query({ from: '2026-09-10', to: '2026-09-12' }),
    )) as { days: Array<{ date: string }> };

    expect(result.days.map((d) => d.date)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
  });

  it('prices a DAILY night and reports it available', async () => {
    const { useCase } = harness();

    const result = (await useCase.execute(HOST, SLUG, query({ mode: 'daily' }))) as {
      days: Array<{ status: string; price: string | null }>;
    };

    expect(result.days[0]).toMatchObject({ status: 'available' });
    expect(result.days[0]?.price).toBeTruthy();
  });

  it('reports a daily night overlapping a booking as BOOKED', async () => {
    const { useCase } = harness({
      busy: [
        {
          start: new Date('2026-09-10T08:00:00.000Z'),
          end: new Date('2026-09-11T02:00:00.000Z'),
        },
      ],
    });

    const result = (await useCase.execute(HOST, SLUG, query({ mode: 'daily' }))) as {
      days: Array<{ status: string }>;
    };

    expect(result.days[0]?.status).toBe('booked');
  });

  it('counts a live HOLD against daily availability too', async () => {
    const { useCase } = harness({
      holds: [
        {
          start: new Date('2026-09-10T08:00:00.000Z'),
          end: new Date('2026-09-11T02:00:00.000Z'),
        },
      ],
    });

    const result = (await useCase.execute(HOST, SLUG, query({ mode: 'daily' }))) as {
      days: Array<{ status: string }>;
    };

    expect(result.days[0]?.status).toBe('booked');
  });

  it('reports a CLOSED weekday as closed, not blocked', async () => {
    // 2026-09-10 is a Thursday (weekday 4).
    const { useCase } = harness({
      rules: OPEN_ALL_WEEK.filter((r) => r.dayOfWeek !== 4),
    });

    const result = (await useCase.execute(HOST, SLUG, query({ mode: 'daily' }))) as {
      days: Array<{ status: string; price: string | null }>;
    };

    expect(result.days[0]).toMatchObject({ status: 'closed', price: null });
  });

  it('reports a date closed by EXCEPTION as blocked', async () => {
    // A deliberate closure is a different answer from "we never open then".
    const { useCase } = harness({
      exceptions: [{ date: '2026-09-10', type: 'closed', windows: null }],
    });

    const result = (await useCase.execute(HOST, SLUG, query({ mode: 'daily' }))) as {
      days: Array<{ status: string }>;
    };

    expect(result.days[0]?.status).toBe('blocked');
  });

  it('lets a custom-hours EXCEPTION open a normally closed weekday', async () => {
    const { useCase } = harness({
      rules: OPEN_ALL_WEEK.filter((r) => r.dayOfWeek !== 4),
      exceptions: [
        { date: '2026-09-10', type: 'custom_hours', windows: null, openTime: '08:00', closeTime: '18:00' },
      ],
    });

    const result = (await useCase.execute(HOST, SLUG, query({ mode: 'daily' }))) as {
      days: Array<{ status: string }>;
    };

    expect(result.days[0]?.status).toBe('available');
  });

  it('treats a listing with NO weekly rules as open every day', async () => {
    const { useCase } = harness({ rules: [] });

    const result = (await useCase.execute(HOST, SLUG, query({ mode: 'daily' }))) as {
      days: Array<{ status: string }>;
    };

    expect(result.days[0]?.status).toBe('available');
  });

  it('translates a package-selection failure into the listing pricing error', async () => {
    // The shared pricing kernel's error type means nothing to an HTTP client.
    const { useCase } = harness({
      listing: listing({ bookingSelection: 'fixed_packages' }),
    });

    await expect(
      useCase.execute(HOST, SLUG, query({ packageId: 'nope' })),
    ).rejects.toBeInstanceOf(ListingPricingRejected);
  });

  it('keys the hourly cache by the SELECTED PACKAGE, not just the date', async () => {
    // Two packages price the same date differently; one key would serve one
    // package's prices for the other.
    const { useCase, cacheReads } = harness({
      listing: listing({
        bookingSelection: 'fixed_packages',
        modeConfig: {
          hourly: {
            basePrice: '500000',
            granularity: 60,
            leadTimeMin: 0,
            packages: [
              { id: 'pkg-2h', mode: 'hourly', durationMinutes: 120, price: '900000', isActive: true },
            ],
          },
        },
      }),
      cached: [],
    });

    await useCase.execute(HOST, SLUG, query({ packageId: 'pkg-2h' }));

    expect(cacheReads[0]).toMatchObject({ selectionKey: 'pkg-2h' });
  });

  it('refuses a package id the listing does not offer', async () => {
    // Daily packages live inside the daily config, so an absent config and an
    // unknown id are the same refusal — there is no reachable state where the
    // package resolves and its mode block does not exist.
    const { useCase } = harness({
      listing: listing({
        bookingSelection: 'fixed_packages',
        bookingModes: ['daily'],
        modeConfig: { daily: undefined, hourly: undefined },
      }),
    });

    await expect(
      useCase.execute(HOST, SLUG, query({ mode: 'daily', packageId: 'pkg-3n' })),
    ).rejects.toBeInstanceOf(ListingPricingRejected);
  });
});
