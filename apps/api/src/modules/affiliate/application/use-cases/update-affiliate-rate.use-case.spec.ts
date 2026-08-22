import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AffiliateState } from '../../domain/entities/affiliate.entity';
import {
  AffiliateNotFound,
  AffiliateTenantShareFloorViolated,
} from '../../domain/errors/affiliate-errors';
import type { IAffiliateRepository } from '../../domain/ports/affiliate-repository.port';
import type { ICommissionRuleReader } from '../../domain/ports/commission-rule-reader.port';
import { UpdateAffiliateRateUseCase } from './update-affiliate-rate.use-case';

const TENANT_ID = 'tenant-1';
const AFFILIATE_ID = 'affiliate-1';

/** Tenant keeps 20%, of which the platform takes 5 — 15 points left to give away. */
const RULE = {
  tenantRateType: 'percent' as const,
  tenantRate: '20',
  platformRate: 5,
  affiliateRate: 8n,
  affiliateRateType: 'percent' as const,
};

const state = (): AffiliateState =>
  ({ id: AFFILIATE_ID, tenantId: TENANT_ID, userId: 'user-1', customRate: null }) as AffiliateState;

function harness(options: { existing?: AffiliateState | null; rule?: unknown } = {}) {
  const writes: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new UpdateAffiliateRateUseCase(
      fakePort<IAffiliateRepository>({
        loadById: () => Promise.resolve(options.existing === undefined ? state() : options.existing),
        setCustomRate: (_tx, id, intent) => {
          writes.push({ id, intent });
          return Promise.resolve({ ...state(), id, customRate: intent.customRate });
        },
      }),
      fakePort<ICommissionRuleReader>({
        findTenantDefault: () =>
          Promise.resolve(('rule' in options ? options.rule : RULE) as never),
      }),
      tenantDb.service,
    ),
    tenantDb,
    writes,
  };
}

describe('UpdateAffiliateRateUseCase', () => {
  it('answers not-found for an unknown affiliate', async () => {
    const { useCase, writes } = harness({ existing: null });

    await expect(
      useCase.execute(TENANT_ID, AFFILIATE_ID, '10'),
    ).rejects.toBeInstanceOf(AffiliateNotFound);
    expect(writes).toEqual([]);
  });

  it('parses the whole-percent rate as BIGINT', async () => {
    // Money parsing lives here so the HTTP layer stays free of it.
    const { useCase, writes, tenantDb } = harness();

    await useCase.execute(TENANT_ID, AFFILIATE_ID, '10');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(writes).toEqual([{ id: AFFILIATE_ID, intent: { customRate: 10n } }]);
  });

  it('REFUSES a rate that would leave the tenant short', async () => {
    // platform% + affiliate% must stay within the tenant's own share, or the
    // tenant pays out more than it takes in.
    const { useCase, writes } = harness();

    await expect(
      useCase.execute(TENANT_ID, AFFILIATE_ID, '18'),
    ).rejects.toBeInstanceOf(AffiliateTenantShareFloorViolated);
    expect(writes).toEqual([]);
  });

  it('CLEARS the override without any floor check', async () => {
    // There is no rate to violate anything with.
    const { useCase, writes } = harness();

    await useCase.execute(TENANT_ID, AFFILIATE_ID, null);

    expect(writes).toEqual([{ id: AFFILIATE_ID, intent: { customRate: null } }]);
  });

  it('answers what the affiliate is now PAID after clearing the override', async () => {
    // `customRate: null` alone does not tell the caller anything; the rule's
    // rate is the answer.
    const { useCase } = harness();

    const result = await useCase.execute(TENANT_ID, AFFILIATE_ID, null);

    expect(result.effectiveRate).toEqual({ rate: 8n, rateType: 'percent', source: 'rule' });
  });

  it('answers the negotiated rate when one was set', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(TENANT_ID, AFFILIATE_ID, '10');

    expect(result.effectiveRate).toEqual({ rate: 10n, rateType: 'percent', source: 'custom' });
  });

  it('stays permissive when the tenant has no default rule to check against', async () => {
    const { useCase, writes } = harness({ rule: null });

    await useCase.execute(TENANT_ID, AFFILIATE_ID, '90');

    expect(writes).toEqual([{ id: AFFILIATE_ID, intent: { customRate: 90n } }]);
  });
});
