import { describe, expect, it } from 'vitest';
import type { PricingRuleRangeInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import type { IOpenHoursReader } from '../../domain/ports/open-hours-reader.port';
import type {
  IPricingRuleRepository,
  PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import { CreatePartnerPricingRuleRangeUseCase } from './create-partner-pricing-rule-range.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';

/** 2026-09-10 is a Thursday, so the span below covers weekdays 4, 5 and 6. */
const DATE_FROM = '2026-09-10';
const DATE_TO = '2026-09-12';

const listing = (overrides: Record<string, unknown> = {}): ListingRecord =>
  ({
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    resourceId: 'resource-1',
    bookingModes: ['hourly', 'daily'],
    bookingSelection: 'flexible_duration',
    ...overrides,
  }) as unknown as ListingRecord;

const rule = (overrides: Record<string, unknown> = {}): PricingRuleRecord =>
  ({
    id: 'rule-existing',
    listingId: LISTING_ID,
    bookingMode: 'hourly',
    ruleType: 'date_time_range',
    params: { date: DATE_FROM, from: '08:00', to: '10:00' },
    price: '400000',
    salePrice: null,
    priority: 0,
    ...overrides,
  }) as unknown as PricingRuleRecord;

const OPEN_ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  openTime: '00:00',
  closeTime: '23:59',
}));

interface Options {
  record?: ListingRecord | null;
  existing?: PricingRuleRecord[];
  /** Weekly opening rules, or a per-date override keyed by ISO date. */
  openRules?: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
  openRulesByDate?: Record<
    string,
    Array<{ dayOfWeek: number; openTime: string; closeTime: string }>
  >;
}

function harness(options: Options = {}) {
  const created: Array<Record<string, unknown>> = [];
  const deleted: string[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  let sequence = 0;
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
    useCase: new CreatePartnerPricingRuleRangeUseCase(
      fakePort<IListingRepository>({
        findById: () => Promise.resolve(options.record === undefined ? listing() : options.record),
      }),
      fakePort<IPricingRuleRepository>({
        // A fresh array per call: the use case mutates what it reads.
        listByListing: () => Promise.resolve([...(options.existing ?? [])]),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
        create: (_tx, _tenantId, data) => {
          created.push(data as unknown as Record<string, unknown>);
          sequence += 1;
          return Promise.resolve({ id: `rule-${sequence}`, ...data } as unknown as PricingRuleRecord);
        },
      }),
      fakePort<IOpenHoursReader>({
        forDate: (_tx, _listingId, _resourceId, date: string) =>
          Promise.resolve({
            rules: options.openRulesByDate?.[date] ?? options.openRules ?? OPEN_ALL_WEEK,
            exception: null,
          } as never),
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    created,
    deleted,
    events,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    bookingMode: 'hourly',
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    window: { from: '08:00', to: '10:00' },
    price: '500000',
    priority: 0,
    ...overrides,
  }) as unknown as PricingRuleRangeInput;

describe('CreatePartnerPricingRuleRangeUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase, created } = harness({ record: null });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input()),
    ).rejects.toBeInstanceOf(ListingNotFound);
    expect(created).toEqual([]);
  });

  it("refuses another partner's listing", async () => {
    const { useCase, created } = harness({ record: listing({ partnerId: 'partner-2' }) });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input()),
    ).rejects.toBeInstanceOf(ListingNotOwned);
    expect(created).toEqual([]);
  });

  it('expands an hourly span to one rule per date', async () => {
    // An hourly rule carries a single date's clock window, so it cannot collapse.
    const { useCase, created } = harness();

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(result.skipped).toEqual([]);
    expect(created.map((c) => c.params)).toEqual([
      { date: '2026-09-10', from: '08:00', to: '10:00' },
      { date: '2026-09-11', from: '08:00', to: '10:00' },
      { date: '2026-09-12', from: '08:00', to: '10:00' },
    ]);
  });

  it('COLLAPSES a daily span to a single date_range row', async () => {
    // The quote calculator matches a date against `[from, to]`, so a 30-night
    // span is one rule — expanding it would write 30 rows that all say the same
    // thing.
    const { useCase, created } = harness();

    const result = await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      LISTING_ID,
      input({ bookingMode: 'daily', window: undefined }),
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      ruleType: 'date_range',
      params: { from: DATE_FROM, to: DATE_TO },
    });
    expect(result.skipped).toEqual([]);
  });

  it('never reads opening hours for a daily span', async () => {
    // A whole-day price has no clock window to fall outside of. The reader is
    // left unstubbed, so a call would fail the test by name.
    const { created } = harness();
    const useCaseWithoutHours = new CreatePartnerPricingRuleRangeUseCase(
      fakePort<IListingRepository>({ findById: () => Promise.resolve(listing()) }),
      fakePort<IPricingRuleRepository>({
        listByListing: () => Promise.resolve([]),
        create: (_tx, _tenantId, data) =>
          Promise.resolve({ id: 'rule-1', ...data } as unknown as PricingRuleRecord),
      }),
      fakePort<IOpenHoursReader>({}),
      fakeTenantDb({ tx: fakeTx({ outboxEvent: { create: () => Promise.resolve({}) } }) })
        .service,
      new OutboxService(),
    );

    await expect(
      useCaseWithoutHours.execute(
        TENANT_ID,
        PARTNER_ID,
        LISTING_ID,
        input({ bookingMode: 'daily', window: undefined }),
      ),
    ).resolves.toMatchObject({ skipped: [] });
    expect(created).toEqual([]);
  });

  it('gates the whole span on the booking mode before touching a single date', async () => {
    // An ineligible listing must fail outright — reporting 30 skips would read
    // as "your dates were closed" when the mode was never on offer.
    const { useCase, created } = harness({ record: listing({ bookingModes: ['daily'] }) });

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input())).rejects.toThrow();
    expect(created).toEqual([]);
  });

  it('SKIPS a closed date instead of failing the span', async () => {
    // A real span nearly always covers a day the listing is shut; failing all of
    // them because of one would make the range action useless.
    const { useCase, created } = harness({
      openRulesByDate: { '2026-09-11': [] },
    });

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(result.skipped).toEqual([{ date: '2026-09-11', reason: 'closed' }]);
    expect(created).toHaveLength(2);
  });

  it('skips a date whose opening hours do not contain the window', async () => {
    const { useCase, created } = harness({
      openRulesByDate: {
        '2026-09-12': [{ dayOfWeek: 6, openTime: '12:00', closeTime: '18:00' }],
      },
    });

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(result.skipped).toEqual([{ date: '2026-09-12', reason: 'outside_open_hours' }]);
    expect(created).toHaveLength(2);
  });

  it('skips a date already covered by an overlapping window', async () => {
    const { useCase, created } = harness({
      existing: [rule({ params: { date: '2026-09-11', from: '09:00', to: '11:00' } })],
    });

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(result.skipped).toEqual([{ date: '2026-09-11', reason: 'overlap' }]);
    expect(created).toHaveLength(2);
  });

  it('replaces an identical window rather than skipping it as an overlap', async () => {
    // `sameWindowKey` and `findOverlappingWindow` disagree on purpose: an exact
    // re-save is an edit, not a collision.
    const { useCase, created, deleted } = harness({ existing: [rule()] });

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(result.skipped).toEqual([]);
    expect(deleted).toEqual(['rule-existing']);
    expect(created).toHaveLength(3);
  });

  it('replaces the identical window on every date of the span', async () => {
    // Re-running the same range action is an edit of each date, not three
    // collisions — one row per date, none skipped.
    const { useCase, created, deleted } = harness({
      existing: [
        rule({ id: 'rule-a', params: { date: '2026-09-10', from: '08:00', to: '10:00' } }),
        rule({ id: 'rule-b', params: { date: '2026-09-11', from: '08:00', to: '10:00' } }),
      ],
    });

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(result.skipped).toEqual([]);
    expect(deleted).toEqual(['rule-a', 'rule-b']);
    expect(created).toHaveLength(3);
  });

  it('replaces the previous daily span covering the same dates', async () => {
    // The collapsed branch keeps the save/replace contract too, so re-applying a
    // month price does not leave two date_range rows fighting over the quote.
    const { useCase, created, deleted } = harness({
      existing: [
        rule({
          ruleType: 'date_range',
          bookingMode: 'daily',
          params: { from: DATE_FROM, to: DATE_TO },
        }),
      ],
    });

    const result = await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      LISTING_ID,
      input({ bookingMode: 'daily', window: undefined }),
    );

    expect(deleted).toEqual(['rule-existing']);
    expect(created).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it('counts rules written in this span towards a later date’s overlap check', async () => {
    // Two dates of one span cannot collide, but a second run over the same span
    // must see the first run's rows — which come from `existing`, not `created`.
    const { useCase } = harness({
      existing: [rule({ params: { date: '2026-09-10', from: '09:30', to: '11:00' } })],
    });

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(result.skipped).toEqual([{ date: '2026-09-10', reason: 'overlap' }]);
    expect(result.created).toHaveLength(2);
  });

  it('announces the span ONCE, not once per row', async () => {
    // The scheduling handler invalidates by listing, so N events would repeat
    // the same work N times.
    const { useCase, tenantDb, events } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(events).toEqual([
      {
        eventType: 'pricing_rule.bulk_created',
        payload: { listingId: LISTING_ID, count: 3 },
      },
    ]);
  });

  it('stays silent when every date was skipped', async () => {
    // Nothing changed, so nothing downstream needs to drop a cache.
    const { useCase, events, created } = harness({ openRules: [] });

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(result.skipped).toHaveLength(3);
    expect(created).toEqual([]);
    expect(events).toEqual([]);
  });

  it('carries the sale price through to every row of the span', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input({ salePrice: '350000' }));

    expect(created).toHaveLength(3);
    for (const row of created) {
      expect(row).toMatchObject({ price: '500000', salePrice: '350000', priority: 0 });
    }
  });
});
