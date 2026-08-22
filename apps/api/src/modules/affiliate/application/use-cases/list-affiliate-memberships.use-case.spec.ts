import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ICommissionRuleReader } from '../../domain/ports/commission-rule-reader.port';
import type { AffiliateWithUser } from '../../domain/ports/affiliate-reader.port';
import type { GetAffiliateMembershipsUseCase } from './get-affiliate-memberships.use-case';
import { ListAffiliateMembershipsUseCase } from './list-affiliate-memberships.use-case';

const membership = (tenantId: string, customRate: bigint | null): AffiliateWithUser =>
  ({ id: `aff-${tenantId}`, tenantId, customRate, status: 'approved' }) as unknown as AffiliateWithUser;

const RULE = { affiliateRate: 8n, affiliateRateType: 'percent' as const };

function harness(memberships: AffiliateWithUser[], rules: Record<string, unknown> = {}) {
  const tenantDb = fakeTenantDb();
  const lookedUp: string[] = [];
  return {
    useCase: new ListAffiliateMembershipsUseCase(
      fakeCollaborator<GetAffiliateMembershipsUseCase>({
        execute: () => Promise.resolve(memberships),
      }),
      fakePort<ICommissionRuleReader>({
        findTenantDefault: () => {
          lookedUp.push('rule');
          return Promise.resolve(('value' in rules ? rules.value : RULE) as never);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    lookedUp,
  };
}

describe('ListAffiliateMembershipsUseCase', () => {
  it("prefers the affiliate's NEGOTIATED rate over the tenant rule", async () => {
    // §15.2 priority: a custom rate is what was agreed with this affiliate.
    const { useCase } = harness([membership('tenant-1', 15n)]);

    const result = await useCase.execute('user-1');

    expect(result).toEqual([
      {
        affiliate: membership('tenant-1', 15n),
        effectiveRate: { rate: 15n, rateType: 'percent', source: 'custom' },
      },
    ]);
  });

  it("falls back to the tenant's default rule", async () => {
    const { useCase } = harness([membership('tenant-1', null)]);

    const result = await useCase.execute('user-1');

    expect(result[0]?.effectiveRate).toEqual({
      rate: 8n,
      rateType: 'percent',
      source: 'rule',
    });
  });

  it('reports ZERO when the tenant has no rule either', async () => {
    // Not "unknown": an affiliate under a tenant with no rule earns nothing,
    // and the dashboard should say so.
    const { useCase } = harness([membership('tenant-1', null)], { value: null });

    const result = await useCase.execute('user-1');

    expect(result[0]?.effectiveRate).toEqual({
      rate: 0n,
      rateType: 'percent',
      source: 'none',
    });
  });

  it("reads each tenant's rule inside THAT tenant's transaction", async () => {
    // The rule table is tenant-scoped by RLS; one shared scope would read the
    // wrong tenant's rate for every membership after the first.
    const { useCase, tenantDb } = harness([
      membership('tenant-1', null),
      membership('tenant-2', null),
    ]);

    await useCase.execute('user-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1', 'tenant-2']);
  });
});
