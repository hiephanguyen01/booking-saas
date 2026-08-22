import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPromoRedemptionRepository } from '../../domain/ports/promo-redemption-repository.port';
import type { IPromotionRepository } from '../../domain/ports/promotion-repository.port';
import { ReleasePromotionUseCase } from './release-promotion.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';

function harness(releasedPromotionId: string | null) {
  const released: string[] = [];
  const returned: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ReleasePromotionUseCase(
      fakePort<IPromotionRepository>({
        releaseUsage: (_tx, id) => {
          returned.push(id);
          return Promise.resolve();
        },
      }),
      fakePort<IPromoRedemptionRepository>({
        release: (_tx, bookingId) => {
          released.push(bookingId);
          return Promise.resolve(releasedPromotionId);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    released,
    returned,
  };
}

describe('ReleasePromotionUseCase', () => {
  it('returns the usage when a redemption was actually released', async () => {
    // Both halves in one transaction: a released redemption whose usage stayed
    // claimed would burn an allowance nobody holds.
    const { useCase, released, returned, tenantDb } = harness('promo-1');

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(released).toEqual([BOOKING_ID]);
    expect(returned).toEqual(['promo-1']);
  });

  it('is IDEMPOTENT — a redelivered event returns nothing twice', async () => {
    // The release is the compare-and-set: a null answer means it was already
    // reversed, and returning the usage again would inflate the allowance.
    const { useCase, returned } = harness(null);

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(returned).toEqual([]);
  });
});
