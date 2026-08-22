import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { PromotionNotFound } from '../../domain/errors/promotion-errors';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { EndPromotionUseCase } from './end-promotion.use-case';

const TENANT_ID = 'tenant-1';
const PROMO_ID = 'promo-1';

const promotion = (status: string): PromotionRecord =>
  ({ id: PROMO_ID, status, code: 'SALE10' }) as unknown as PromotionRecord;

function harness(found: PromotionRecord | null = promotion('active')) {
  const ended: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new EndPromotionUseCase(
      fakePort<IPromotionRepository>({
        findById: () => Promise.resolve(found),
        end: (_tx, id) => {
          ended.push(id);
          return Promise.resolve(promotion('ended'));
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    ended,
  };
}

describe('EndPromotionUseCase', () => {
  it('answers not-found for an unknown promotion', async () => {
    const { useCase, ended } = harness(null);

    await expect(useCase.execute(TENANT_ID, PROMO_ID)).rejects.toBeInstanceOf(
      PromotionNotFound,
    );
    expect(ended).toEqual([]);
  });

  it('ends an active promotion', async () => {
    const { useCase, ended, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, PROMO_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(ended).toEqual([PROMO_ID]);
    expect(result).toMatchObject({ status: 'ended' });
  });

  it('is a NO-OP on an already-ended promotion', async () => {
    // Ending twice would re-stamp the end time and make the audit trail lie
    // about when the campaign actually stopped.
    const { useCase, ended } = harness(promotion('ended'));

    const result = await useCase.execute(TENANT_ID, PROMO_ID);

    expect(ended).toEqual([]);
    expect(result).toMatchObject({ status: 'ended' });
  });
});
