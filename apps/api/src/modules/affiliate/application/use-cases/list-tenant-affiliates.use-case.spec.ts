import { describe, expect, it } from 'vitest';
import type { ListAffiliatesQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IAffiliateCommissionReader } from '../../domain/ports/affiliate-commission-reader.port';
import type {
  AffiliateWithUser,
  IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import type { ICommissionRuleReader } from '../../domain/ports/commission-rule-reader.port';
import type { IReferralLinkReader } from '../../domain/ports/referral-link-reader.port';
import { ListTenantAffiliatesUseCase } from './list-tenant-affiliates.use-case';

const TENANT_ID = 'tenant-1';
const RULE = { affiliateRate: 8n, affiliateRateType: 'percent' as const };

const row = (id: string, customRate: bigint | null): AffiliateWithUser =>
  ({ id, customRate }) as unknown as AffiliateWithUser;

const TOTALS = { pending: 1n, confirmed: 2n, paid: 3n } as never;

function harness(items: AffiliateWithUser[]) {
  const tenantDb = fakeTenantDb();
  let ruleReads = 0;
  const enrichedFor: string[] = [];
  const queries: unknown[] = [];
  return {
    useCase: new ListTenantAffiliatesUseCase(
      fakePort<IAffiliateReader>({
        list: (_tx, query) => {
          queries.push(query);
          return Promise.resolve({ items, total: items.length, counts: { all: items.length } } as never);
        },
      }),
      fakePort<IReferralLinkReader>({
        countByAffiliate: (_tx, id) => {
          enrichedFor.push(id);
          return Promise.resolve(2);
        },
        totalClicksForAffiliate: () => Promise.resolve(42),
      }),
      fakePort<IAffiliateCommissionReader>({
        totalsForAffiliate: () => Promise.resolve(TOTALS),
      }),
      fakePort<ICommissionRuleReader>({
        findTenantDefault: () => {
          ruleReads += 1;
          return Promise.resolve(RULE as never);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    ruleReads: () => ruleReads,
    enrichedFor,
    queries,
  };
}

describe('ListTenantAffiliatesUseCase', () => {
  it('reads the tenant rule ONCE for the whole page', async () => {
    // The baseline rate is per tenant, not per row; a read per affiliate would
    // make the page scale with its own size.
    const { useCase, ruleReads } = harness([row('a', null), row('b', null), row('c', null)]);

    await useCase.execute(TENANT_ID, {} as ListAffiliatesQuery);

    expect(ruleReads()).toBe(1);
  });

  it('enriches only the rows on this PAGE', async () => {
    const { useCase, enrichedFor } = harness([row('a', null), row('b', null)]);

    await useCase.execute(TENANT_ID, {} as ListAffiliatesQuery);

    expect(enrichedFor).toEqual(['a', 'b']);
  });

  it('keeps the per-status totals separate rather than pre-summing them', async () => {
    // Pending is not owed yet, confirmed is owed now and paid is settled —
    // three different answers to "what do I pay this affiliate".
    const { useCase } = harness([row('a', null)]);

    const result = await useCase.execute(TENANT_ID, {} as ListAffiliatesQuery);

    expect(result.items[0]).toMatchObject({ totals: TOTALS, linksCount: 2, clicks: 42 });
  });

  it('resolves each row’s effective rate, custom over rule', async () => {
    const { useCase } = harness([row('a', 15n), row('b', null)]);

    const result = await useCase.execute(TENANT_ID, {} as ListAffiliatesQuery);

    expect(result.items.map((i) => i.effectiveRate)).toEqual([
      { rate: 15n, rateType: 'percent', source: 'custom' },
      { rate: 8n, rateType: 'percent', source: 'rule' },
    ]);
  });

  it('passes the query through and preserves the page totals and counts', async () => {
    const { useCase, queries, tenantDb } = harness([row('a', null)]);
    const query = { page: 2, pageSize: 50, status: 'pending' } as ListAffiliatesQuery;

    const result = await useCase.execute(TENANT_ID, query);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(queries).toEqual([query]);
    expect(result).toMatchObject({ total: 1, counts: { all: 1 } });
  });
});
