import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPromoRedemptionRepository } from '../../domain/ports/promo-redemption-repository.port';
import { MarkPromotionAppliedUseCase } from './mark-promotion-applied.use-case';

describe('MarkPromotionAppliedUseCase', () => {
  it('moves the redemption to applied inside its own transaction', async () => {
    // The handler carries no request context, so it opens the tenant scope
    // itself; the repository owns the reserved→applied compare-and-set that
    // makes a redelivery harmless.
    const marked: string[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new MarkPromotionAppliedUseCase(
      fakePort<IPromoRedemptionRepository>({
        markApplied: (_tx, bookingId) => {
          marked.push(bookingId);
          return Promise.resolve(true);
        },
      }),
      tenantDb.service,
    );

    await useCase.execute('tenant-1', 'booking-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(marked).toEqual(['booking-1']);
  });
});
