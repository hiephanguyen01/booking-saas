import { describe, expect, it } from 'vitest';
import type { CalendarRangeQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import type {
  IPricingRuleRepository,
  PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import { LegacyListingNotFound, LegacyListingNotOwned } from '../listing-legacy-http-errors';
import { ListPartnerPricingRulesUseCase } from './list-partner-pricing-rules.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';

const listing = (partnerId = PARTNER_ID): ListingRecord =>
  ({ id: LISTING_ID, tenantId: TENANT_ID, partnerId }) as unknown as ListingRecord;

function harness(record: ListingRecord | null) {
  const windows: unknown[] = [];
  const rows = [] as PricingRuleRecord[];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListPartnerPricingRulesUseCase(
      fakePort<IListingRepository>({ findById: () => Promise.resolve(record) }),
      fakePort<IPricingRuleRepository>({
        listByListing: (_tx, _listingId, window) => {
          windows.push(window);
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    windows,
    rows,
  };
}

describe('ListPartnerPricingRulesUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID)).rejects.toBeInstanceOf(
      LegacyListingNotFound,
    );
  });

  it("refuses another partner's listing", async () => {
    const { useCase, windows } = harness(listing('partner-2'));

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID)).rejects.toBeInstanceOf(
      LegacyListingNotOwned,
    );
    expect(windows).toEqual([]);
  });

  it('narrows date-scoped rules to the requested calendar window', async () => {
    const { useCase, tenantDb, windows, rows } = harness(listing());

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, {
        from: '2026-09-01',
        to: '2026-09-30',
      } as CalendarRangeQuery),
    ).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(windows).toEqual([{ from: '2026-09-01', to: '2026-09-30' }]);
  });

  it('returns every rule when no window is given', async () => {
    const { useCase, windows } = harness(listing());

    await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID);

    expect(windows).toEqual([undefined]);
  });

  it('ignores a half-specified window rather than guessing the other end', async () => {
    // A calendar asking "from September" with no end would otherwise get an
    // arbitrary range; the repository is left to return everything instead.
    const { useCase, windows } = harness(listing());

    await useCase.execute(TENANT_ID, PARTNER_ID, LISTING_ID, {
      from: '2026-09-01',
    } as CalendarRangeQuery);

    expect(windows).toEqual([undefined]);
  });
});
