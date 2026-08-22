import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { PromotionNotFound } from '../../domain/errors/promotion-errors';
import type { IPromoContextLookup } from '../../domain/ports/promo-context-lookup.port';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { GetPromotionUseCase } from './get-promotion.use-case';

const TENANT_ID = 'tenant-1';
const PROMO_ID = 'promo-1';

const promotion = (overrides: Record<string, unknown> = {}): PromotionRecord =>
  ({
    id: PROMO_ID,
    code: 'SALE10',
    appliesTo: 'listing',
    appliesToId: 'listing-1',
    fundedBy: 'tenant',
    fundingPartnerId: null,
    ...overrides,
  }) as unknown as PromotionRecord;

function harness(found: PromotionRecord | null = promotion()) {
  const scopeLookups: Array<{ appliesTo: string; id: string }> = [];
  const readIds: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetPromotionUseCase(
      fakePort<IPromotionRepository>({
        findById: (_tx, id) => {
          readIds.push(id);
          return Promise.resolve(found);
        },
      }),
      fakePort<IPromoContextLookup>({
        resolveScopeTargetLabel: (_tx, appliesTo, id) => {
          scopeLookups.push({ appliesTo, id });
          return Promise.resolve('Sân bóng số 1');
        },
        getPartnerName: () => Promise.resolve('Studio Giang'),
      }),
      tenantDb.service,
    ),
    tenantDb,
    scopeLookups,
    readIds,
  };
}

describe('GetPromotionUseCase', () => {
  it('answers not-found for a promotion outside this tenant', async () => {
    // The read runs inside the tenant transaction, so RLS is what makes a
    // guessed id resolve to nothing.
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, PROMO_ID)).rejects.toBeInstanceOf(
      PromotionNotFound,
    );
  });

  it('resolves the scope target into a human LABEL', async () => {
    // The detail screen shows what the promotion applies to; a raw uuid tells
    // the operator nothing.
    const { useCase, scopeLookups, readIds, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, PROMO_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(readIds).toEqual([PROMO_ID]);
    expect(scopeLookups).toEqual([{ appliesTo: 'listing', id: 'listing-1' }]);
    expect(result).toMatchObject({ appliesToLabel: 'Sân bóng số 1' });
  });

  it('spends no label lookup on the `all` scope', async () => {
    const { useCase, scopeLookups } = harness(
      promotion({ appliesTo: 'all', appliesToId: null }),
    );

    const result = await useCase.execute(TENANT_ID, PROMO_ID);

    expect(scopeLookups).toEqual([]);
    expect(result.appliesToLabel).toBeNull();
  });
});
