import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPromotionRepository } from '../../domain/ports/promotion-repository.port';
import { ListPendingOptInUseCase } from './list-pending-optin.use-case';

const ROWS = [{ id: 'promo-1' }] as never;

describe('ListPendingOptInUseCase', () => {
  it('lists what THIS partner is being asked to fund', async () => {
    // Another partner's pending promotions would show a partner discounts they
    // have no say over.
    const asked: string[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListPendingOptInUseCase(
      fakePort<IPromotionRepository>({
        listPendingOptIn: (_tx, partnerId) => {
          asked.push(partnerId);
          return Promise.resolve(ROWS);
        },
      }),
      tenantDb.service,
    );

    await expect(useCase.execute('tenant-1', 'partner-1')).resolves.toBe(ROWS);
    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(asked).toEqual(['partner-1']);
  });
});
