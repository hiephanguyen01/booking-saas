import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';
import { PricingRuleNotFound } from '../../domain/errors/pricing-rule-errors';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import type {
  IPricingRuleRepository,
  PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import { DeletePartnerPricingRuleUseCase } from './delete-partner-pricing-rule.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';
const RULE_ID = 'rule-1';

const listing = (partnerId = PARTNER_ID): ListingRecord =>
  ({ id: LISTING_ID, tenantId: TENANT_ID, partnerId }) as unknown as ListingRecord;

const rule = (listingId = LISTING_ID): PricingRuleRecord =>
  ({ id: RULE_ID, listingId }) as unknown as PricingRuleRecord;

function harness(record: ListingRecord | null, ruleRecord: PricingRuleRecord | null) {
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
    useCase: new DeletePartnerPricingRuleUseCase(
      fakePort<IListingRepository>({ findById: () => Promise.resolve(record) }),
      fakePort<IPricingRuleRepository>({
        findById: () => Promise.resolve(ruleRecord),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    deleted,
    events,
  };
}

describe('DeletePartnerPricingRuleUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase } = harness(null, rule());

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, RULE_ID),
    ).rejects.toBeInstanceOf(ListingNotFound);
  });

  it("refuses another partner's listing", async () => {
    const { useCase, deleted } = harness(listing('partner-2'), rule());

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, RULE_ID),
    ).rejects.toBeInstanceOf(ListingNotOwned);
    expect(deleted).toEqual([]);
  });

  it('refuses a rule that belongs to a DIFFERENT listing', async () => {
    // The rule id is guessable and ownership was checked on the listing in the
    // URL — without this a partner could delete a neighbour's rule by pointing at
    // their own listing.
    const { useCase, deleted } = harness(listing(), rule('listing-2'));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, RULE_ID),
    ).rejects.toBeInstanceOf(PricingRuleNotFound);
    expect(deleted).toEqual([]);
  });

  it('deletes the rule and announces it with its listing', async () => {
    const { useCase, tenantDb, deleted, events } = harness(listing(), rule());

    await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, RULE_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([RULE_ID]);
    expect(events).toEqual([
      {
        eventType: 'pricing_rule.deleted',
        payload: { pricingRuleId: RULE_ID, listingId: LISTING_ID },
      },
    ]);
  });
});
