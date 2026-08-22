import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { AffiliateNotFound } from '../../domain/errors/affiliate-errors';
import type { IAffiliateCommissionReader } from '../../domain/ports/affiliate-commission-reader.port';
import type {
  AffiliateWithUser,
  IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import type { ICommissionRuleReader } from '../../domain/ports/commission-rule-reader.port';
import type { IReferralLinkReader } from '../../domain/ports/referral-link-reader.port';
import { GetTenantAffiliateUseCase } from './get-tenant-affiliate.use-case';

const TENANT_ID = 'tenant-1';
const AFFILIATE_ID = 'affiliate-1';
const LINKS = [{ id: 'link-1' }] as never;
const COMMISSIONS = [{ id: 'commission-1' }] as never;
const TOTALS = { pending: 1n, confirmed: 2n, paid: 3n } as never;
const RULE = { affiliateRate: 8n, affiliateRateType: 'percent' as const };

function harness(options: { affiliate?: AffiliateWithUser | null; customRate?: bigint | null } = {}) {
  const asked: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetTenantAffiliateUseCase(
      fakePort<IAffiliateReader>({
        findByUserWithTenant: (_tx, id) =>
          Promise.resolve(
            options.affiliate === undefined
              ? ({ id, customRate: options.customRate ?? null } as unknown as AffiliateWithUser)
              : options.affiliate,
          ),
      }),
      fakePort<IReferralLinkReader>({
        listByAffiliate: (_tx, id) => {
          asked.push(`links:${id}`);
          return Promise.resolve(LINKS);
        },
        totalClicksForAffiliate: (_tx, id) => {
          asked.push(`clicks:${id}`);
          return Promise.resolve(42);
        },
      }),
      fakePort<IAffiliateCommissionReader>({
        listByAffiliate: (_tx, id) => {
          asked.push(`commissions:${id}`);
          return Promise.resolve(COMMISSIONS);
        },
        totalsForAffiliate: (_tx, id) => {
          asked.push(`totals:${id}`);
          return Promise.resolve(TOTALS);
        },
      }),
      fakePort<ICommissionRuleReader>({
        findTenantDefault: () => Promise.resolve(RULE as never),
      }),
      tenantDb.service,
    ),
    tenantDb,
    asked,
  };
}

describe('GetTenantAffiliateUseCase', () => {
  it('answers not-found for an affiliate outside this tenant', async () => {
    // The reader runs inside the tenant transaction, so RLS is what makes a
    // guessed id resolve to nothing.
    const { useCase } = harness({ affiliate: null });

    await expect(
      useCase.execute(TENANT_ID, AFFILIATE_ID),
    ).rejects.toBeInstanceOf(AffiliateNotFound);
  });

  it('composes links, commissions, totals and clicks for THIS affiliate', async () => {
    const { useCase, tenantDb, asked } = harness();

    const result = await useCase.execute(TENANT_ID, AFFILIATE_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(asked.sort()).toEqual([
      `clicks:${AFFILIATE_ID}`,
      `commissions:${AFFILIATE_ID}`,
      `links:${AFFILIATE_ID}`,
      `totals:${AFFILIATE_ID}`,
    ]);
    expect(result).toMatchObject({
      links: LINKS,
      commissions: COMMISSIONS,
      clicks: 42,
      totals: TOTALS,
    });
  });

  it('resolves the rate the affiliate is actually paid at', async () => {
    const withCustom = harness({ customRate: 15n });
    const withoutCustom = harness({ customRate: null });

    await expect(withCustom.useCase.execute(TENANT_ID, AFFILIATE_ID)).resolves.toMatchObject({
      effectiveRate: { rate: 15n, source: 'custom' },
    });
    await expect(withoutCustom.useCase.execute(TENANT_ID, AFFILIATE_ID)).resolves.toMatchObject({
      effectiveRate: { rate: 8n, source: 'rule' },
    });
  });
});
