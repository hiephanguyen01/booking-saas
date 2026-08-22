import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { PromotionNotFound } from '../../domain/errors/promotion-errors';
import type { IPromoContextLookup } from '../../domain/ports/promo-context-lookup.port';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { GetPartnerPromotionUseCase } from './get-partner-promotion.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const PROMO_ID = 'promo-1';

const promotion = (overrides: Record<string, unknown> = {}): PromotionRecord =>
  ({
    id: PROMO_ID,
    appliesTo: 'all',
    appliesToId: null,
    createdByPartnerId: PARTNER_ID,
    fundingPartnerId: null,
    fundedBy: 'partner',
    ...overrides,
  }) as unknown as PromotionRecord;

function harness(found: PromotionRecord | null = promotion()) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetPartnerPromotionUseCase(
      fakePort<IPromotionRepository>({ findById: () => Promise.resolve(found) }),
      fakePort<IPromoContextLookup>({
        resolveScopeTargetLabel: () => Promise.resolve('Sân bóng số 1'),
        getPartnerName: () => Promise.resolve('Studio Giang'),
      }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetPartnerPromotionUseCase', () => {
  it('answers not-found for an unknown promotion', async () => {
    const { useCase } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID),
    ).rejects.toBeInstanceOf(PromotionNotFound);
  });

  it('shows a promotion the partner CREATED', async () => {
    const { useCase, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toMatchObject({ id: PROMO_ID });
  });

  it('shows a tenant-created promotion the partner FUNDS', async () => {
    // The partner pays for it, so they must be able to read its terms.
    const { useCase } = harness(
      promotion({ createdByPartnerId: null, fundingPartnerId: PARTNER_ID }),
    );

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID),
    ).resolves.toMatchObject({ id: PROMO_ID });
  });

  it("HIDES a promotion the partner neither created nor funds", async () => {
    // Same not-found as a missing row, so the response does not confirm the
    // promotion exists.
    const { useCase } = harness(
      promotion({ createdByPartnerId: 'partner-2', fundingPartnerId: 'partner-2' }),
    );

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID),
    ).rejects.toBeInstanceOf(PromotionNotFound);
  });
});
