import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IAffiliateCommissionReader } from '../../domain/ports/affiliate-commission-reader.port';
import type { IReferralLinkReader } from '../../domain/ports/referral-link-reader.port';
import { GetAffiliateStatsUseCase } from './get-affiliate-stats.use-case';

const TOTALS = { pending: 10n, confirmed: 20n, paid: 30n } as never;

describe('GetAffiliateStatsUseCase', () => {
  it('pairs the commission totals with the click count, for THIS affiliate', async () => {
    // Both reads are affiliate-scoped inside the tenant transaction; RLS scopes
    // the tenant, not the affiliate.
    const commissionsFor: string[] = [];
    const clicksFor: string[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new GetAffiliateStatsUseCase(
      fakePort<IAffiliateCommissionReader>({
        totalsForAffiliate: (_tx, affiliateId) => {
          commissionsFor.push(affiliateId);
          return Promise.resolve(TOTALS);
        },
      }),
      fakePort<IReferralLinkReader>({
        totalClicksForAffiliate: (_tx, affiliateId) => {
          clicksFor.push(affiliateId);
          return Promise.resolve(42);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute('tenant-1', 'affiliate-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(commissionsFor).toEqual(['affiliate-1']);
    expect(clicksFor).toEqual(['affiliate-1']);
    expect(result).toEqual({ clicks: 42, totals: TOTALS });
  });
});
