import { describe, expect, it } from 'vitest';
import type { PricingRuleInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';
import {
  PricingRuleOverlap,
  PricingWindowOutsideOpenHours,
  RecurringPricingRuleOverlap,
} from '../../domain/errors/pricing-rule-errors';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import type { IOpenHoursReader } from '../../domain/ports/open-hours-reader.port';
import type {
  IPricingRuleRepository,
  PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import { CreatePartnerPricingRuleUseCase } from './create-partner-pricing-rule.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';

const listing = (partnerId = PARTNER_ID): ListingRecord =>
  ({
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId,
    resourceId: 'resource-1',
    bookingModes: ['hourly'],
    bookingSelection: 'flexible_duration',
  }) as unknown as ListingRecord;

const rule = (overrides: Record<string, unknown> = {}): PricingRuleRecord =>
  ({
    id: 'rule-existing',
    listingId: LISTING_ID,
    bookingMode: 'hourly',
    ruleType: 'date_time_range',
    params: { date: '2026-09-10', from: '08:00', to: '10:00' },
    price: '400000',
    salePrice: null,
    priority: 10,
    ...overrides,
  }) as unknown as PricingRuleRecord;

interface Options {
  record?: ListingRecord | null;
  existing?: PricingRuleRecord[];
  /** Weekly opening windows for the date the rule targets. */
  openRules?: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
}

function harness(options: Options = {}) {
  const created: Array<Record<string, unknown>> = [];
  const deleted: string[] = [];
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
    useCase: new CreatePartnerPricingRuleUseCase(
      fakePort<IListingRepository>({
        findById: () => Promise.resolve(options.record === undefined ? listing() : options.record),
      }),
      fakePort<IPricingRuleRepository>({
        listByListing: () => Promise.resolve(options.existing ?? []),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
        create: (_tx, _tenantId, data) => {
          created.push(data as unknown as Record<string, unknown>);
          return Promise.resolve({ id: 'rule-new', ...data } as unknown as PricingRuleRecord);
        },
      }),
      fakePort<IOpenHoursReader>({
        forDate: () =>
          Promise.resolve({
            rules:
              options.openRules ??
              [{ dayOfWeek: 4, openTime: '00:00', closeTime: '23:59' }],
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
    ruleType: 'date_time_range',
    params: { date: '2026-09-10', from: '08:00', to: '10:00' },
    price: '500000',
    priority: 10,
    ...overrides,
  }) as unknown as PricingRuleInput;

describe('CreatePartnerPricingRuleUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase, created } = harness({ record: null });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input()),
    ).rejects.toBeInstanceOf(ListingNotFound);
    expect(created).toEqual([]);
  });

  it("refuses another partner's listing", async () => {
    const { useCase, created } = harness({ record: listing('partner-2') });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input()),
    ).rejects.toBeInstanceOf(ListingNotOwned);
    expect(created).toEqual([]);
  });

  it('refuses a rule for a mode the listing does not offer', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input({ bookingMode: 'daily' })),
    ).rejects.toThrow();
  });

  it('refuses a window overlapping another window on the same day', async () => {
    // Two date_time_range rules covering the same instant resolve by array order,
    // so the price would depend on insertion order rather than the partner's
    // intent.
    const { useCase, created } = harness({
      existing: [rule({ params: { date: '2026-09-10', from: '09:00', to: '11:00' } })],
    });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input()),
    ).rejects.toBeInstanceOf(PricingRuleOverlap);
    expect(created).toEqual([]);
  });

  it('REPLACES an identical window rather than stacking a duplicate', async () => {
    // Calendar edits are save operations: dragging the same window twice must not
    // leave two rows behind.
    const { useCase, deleted, created } = harness({ existing: [rule()] });

    await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(deleted).toEqual(['rule-existing']);
    expect(created).toHaveLength(1);
  });

  it('refuses a window that falls outside the opening hours of that date', async () => {
    // Enforced here rather than in the dashboard so it holds for every partner —
    // reading the hours needs a scope not every partner has.
    const { useCase, created } = harness({
      openRules: [{ dayOfWeek: 4, openTime: '12:00', closeTime: '18:00' }],
    });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input()),
    ).rejects.toBeInstanceOf(PricingWindowOutsideOpenHours);
    expect(created).toEqual([]);
  });

  it('refuses a recurring rule colliding with another recurring rule', async () => {
    // Recurring rules share one priority band, so a collision resolves by array
    // order — refuse it instead of letting an arbitrary one win.
    const { useCase, created } = harness({
      existing: [rule({ ruleType: 'day_of_week', params: { days: [0, 6] } })],
    });

    await expect(
      useCase.execute(
        TENANT_ID,
        PARTNER_ID,
        LISTING_ID,
        input({ ruleType: 'day_of_week', params: { days: [0, 1] } }),
      ),
    ).rejects.toBeInstanceOf(RecurringPricingRuleOverlap);
    expect(created).toEqual([]);
  });

  it('replaces an IDENTICAL recurring scope instead of duplicating it', async () => {
    // The overlap check deliberately does not flag an identical scope, so this
    // replace is what stops a repeated save becoming a second row.
    //
    // The stored rule holds `[0, 6]` while the request sends `[6, 0]`: `days` is
    // sorted on the way in, so the two ARE the same scope and the identity check
    // has to compare the normalised form. A fixture holding the unsorted array
    // made this test fail against correct code.
    const { useCase, deleted, created } = harness({
      existing: [rule({ ruleType: 'day_of_week', params: { days: [0, 6] } })],
    });

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      LISTING_ID,
      input({ ruleType: 'day_of_week', params: { days: [6, 0] } }),
    );

    expect(deleted).toEqual(['rule-existing']);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ params: { days: [0, 6] } });
  });

  it('checks no opening hours for a plain date_range', async () => {
    // A whole-day override has no window to fall outside of.
    const { useCase, created } = harness({
      openRules: [{ dayOfWeek: 4, openTime: '12:00', closeTime: '18:00' }],
    });

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      LISTING_ID,
      input({ ruleType: 'date_range', params: { from: '2026-09-10', to: '2026-09-12' } }),
    );

    expect(created).toHaveLength(1);
  });

  it('replaces the previous date_range covering the same dates', async () => {
    // date_range shares the save/replace contract with date_time_range: the only
    // thing it skips is the opening-hours check.
    const params = { from: '2026-09-10', to: '2026-09-12' };
    const { useCase, deleted, created } = harness({
      existing: [rule({ ruleType: 'date_range', params })],
    });

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      LISTING_ID,
      input({ ruleType: 'date_range', params }),
    );

    expect(deleted).toEqual(['rule-existing']);
    expect(created).toHaveLength(1);
  });

  it('carries the sale price through, and stores null when there is none', async () => {
    // The rule row is what the quote reads, so a promotional price dropped here
    // is a price the customer never sees.
    const withSale = harness();
    await withSale.useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      LISTING_ID,
      input({ salePrice: '350000' }),
    );
    expect(withSale.created[0]).toMatchObject({ price: '500000', salePrice: '350000' });

    const withoutSale = harness();
    await withoutSale.useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());
    expect(withoutSale.created[0]).toMatchObject({ salePrice: null });
  });

  it('names the colliding hours when the collision is a time_range', async () => {
    // A weekday-only message would leave the partner hunting for which of the
    // day's rules they hit.
    const { useCase } = harness({
      existing: [
        rule({ ruleType: 'time_range', params: { days: [1, 2], from: '08:00', to: '12:00' } }),
      ],
    });

    await expect(
      useCase.execute(
        TENANT_ID,
        PARTNER_ID,
        LISTING_ID,
        input({ ruleType: 'time_range', params: { days: [2, 3], from: '10:00', to: '14:00' } }),
      ),
    ).rejects.toMatchObject({
      code: 'RECURRING_PRICING_RULE_OVERLAP',
      details: { days: [1, 2], window: { from: '08:00', to: '12:00' } },
    });
  });

  it('announces the new rule so cached prices are dropped', async () => {
    const { useCase, tenantDb, events } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(events).toEqual([
      {
        eventType: 'pricing_rule.created',
        payload: { pricingRuleId: 'rule-new', listingId: LISTING_ID },
      },
    ]);
  });
});
