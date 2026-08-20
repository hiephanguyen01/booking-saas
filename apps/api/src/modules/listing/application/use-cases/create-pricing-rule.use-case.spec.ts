import { describe, expect, it } from 'vitest';
import type { PricingRuleInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingNotFound } from '../../domain/errors/listing-errors';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import type {
  IPricingRuleRepository,
  PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import { CreatePricingRuleUseCase } from './create-pricing-rule.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';

const listing = (overrides: Record<string, unknown> = {}): ListingRecord =>
  ({
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: 'partner-1',
    bookingModes: ['hourly'],
    bookingSelection: 'flexible_duration',
    ...overrides,
  }) as unknown as ListingRecord;

function harness(record: ListingRecord | null) {
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
    useCase: new CreatePricingRuleUseCase(
      fakePort<IPricingRuleRepository>({
        create: (_tx, _tenantId, data) => {
          created.push(data as unknown as Record<string, unknown>);
          return Promise.resolve({ id: 'rule-1', ...data } as unknown as PricingRuleRecord);
        },
      }),
      fakePort<IListingRepository>({ findById: () => Promise.resolve(record) }),
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
    bookingMode: 'hourly',
    ruleType: 'weekday',
    params: { daysOfWeek: [6, 0] },
    price: '400000',
    priority: 10,
    ...overrides,
  }) as unknown as PricingRuleInput;

describe('CreatePricingRuleUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase, created } = harness(null);

    await expect(useCase.execute(TENANT_ID, LISTING_ID, input())).rejects.toBeInstanceOf(
      ListingNotFound,
    );
    expect(created).toEqual([]);
  });

  it('refuses a rule for a mode the listing does not offer', async () => {
    // A daily rule on an hourly-only listing would never fire, and the partner
    // would be left believing their weekend price is in effect.
    const { useCase, created } = harness(listing({ bookingModes: ['hourly'] }));

    await expect(
      useCase.execute(TENANT_ID, LISTING_ID, input({ bookingMode: 'daily' })),
    ).rejects.toThrow();
    expect(created).toEqual([]);
  });

  it('normalises an absent sale price to null rather than undefined', async () => {
    // The column is nullable; `undefined` would be dropped by the repository patch
    // and leave a stale sale price behind on an upsert path.
    const { useCase, created } = harness(listing());

    await useCase.execute(TENANT_ID, LISTING_ID, input());

    expect(created[0]).toMatchObject({ listingId: LISTING_ID, price: '400000', salePrice: null });
  });

  it('stores the rule and announces it so cached prices are dropped', async () => {
    const { useCase, tenantDb, events } = harness(listing());

    await useCase.execute(TENANT_ID, LISTING_ID, input({ salePrice: '300000' }));

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(events).toEqual([
      {
        eventType: 'pricing_rule.created',
        payload: { pricingRuleId: 'rule-1', listingId: LISTING_ID },
      },
    ]);
  });
});
