import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { PromotionNotFound, PromotionNotOwned } from '../../domain/errors/promotion-errors';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { EndPartnerPromotionUseCase } from './end-partner-promotion.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const PROMO_ID = 'promo-1';

const promotion = (createdByPartnerId: string | null, status = 'active'): PromotionRecord =>
  ({ id: PROMO_ID, createdByPartnerId, status }) as unknown as PromotionRecord;

function harness(found: PromotionRecord | null = promotion(PARTNER_ID)) {
  const ended: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new EndPartnerPromotionUseCase(
      fakePort<IPromotionRepository>({
        findById: () => Promise.resolve(found),
        end: (_tx, id) => {
          ended.push(id);
          return Promise.resolve(promotion(PARTNER_ID, 'ended'));
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    ended,
  };
}

describe('EndPartnerPromotionUseCase', () => {
  it('answers not-found for an unknown promotion', async () => {
    const { useCase, ended } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID),
    ).rejects.toBeInstanceOf(PromotionNotFound);
    expect(ended).toEqual([]);
  });

  it("refuses a promotion ANOTHER partner created", async () => {
    const { useCase, ended } = harness(promotion('partner-2'));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID),
    ).rejects.toBeInstanceOf(PromotionNotOwned);
    expect(ended).toEqual([]);
  });

  it("refuses a TENANT-created promotion the partner merely funds", async () => {
    // Opting in to fund one is not the same as owning it — only the creator may
    // end it.
    const { useCase, ended } = harness(promotion(null));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID),
    ).rejects.toBeInstanceOf(PromotionNotOwned);
    expect(ended).toEqual([]);
  });

  it('ends the partner’s own promotion', async () => {
    const { useCase, ended, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(ended).toEqual([PROMO_ID]);
    expect(result).toMatchObject({ status: 'ended' });
  });

  it('writes unconditionally on an already-ended promotion', async () => {
    // A recorded gap (§8a): unlike the tenant path this one does not
    // short-circuit, because aligning them would change the API response.
    const { useCase, ended } = harness(promotion(PARTNER_ID, 'ended'));

    await useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID);

    expect(ended).toEqual([PROMO_ID]);
  });
});
