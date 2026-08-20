import { describe, expect, it } from 'vitest';
import { fakePort, fakeTx } from '~testing';
import type { IPromoRedemptionRepository } from '../../domain/ports/promo-redemption-repository.port';
import type { IPromotionRepository } from '../../domain/ports/promotion-repository.port';
import { ReservePromotionUseCase } from './reserve-promotion.use-case';

const TENANT_ID = 'tenant-1';

interface Options {
  claimed?: boolean;
  used?: number;
}

function harness(options: Options = {}) {
  const order: string[] = [];
  const locks: Array<{ promotionId: string; customerId: string }> = [];
  const claims: string[] = [];
  const reservations: unknown[] = [];
  return {
    useCase: new ReservePromotionUseCase(
      fakePort<IPromotionRepository>({
        claimUsage: (_tx, id) => {
          order.push('claimUsage');
          claims.push(id);
          return Promise.resolve(options.claimed ?? true);
        },
      }),
      fakePort<IPromoRedemptionRepository>({
        lockPerCustomer: (_tx, promotionId, customerId) => {
          order.push('lockPerCustomer');
          locks.push({ promotionId, customerId });
          return Promise.resolve();
        },
        countActiveByCustomer: () => {
          order.push('countActiveByCustomer');
          return Promise.resolve(options.used ?? 0);
        },
        reserve: (...args: unknown[]) => {
          order.push('reserve');
          reservations.push(args.slice(1));
          return Promise.resolve();
        },
      }),
    ),
    order,
    locks,
    claims,
    reservations,
  };
}

const tx = fakeTx({});

const data = (overrides: Record<string, unknown> = {}) => ({
  promotionId: 'promo-1',
  bookingId: 'booking-1',
  customerId: 'user-1',
  discountAmount: 100_000n,
  usageLimitPerCustomer: null as number | null,
  ...overrides,
});

describe('ReservePromotionUseCase', () => {
  it('LOCKS by (promotion, customer) before counting', async () => {
    // Two tabs would otherwise both read "0 used" and both slip past the cap.
    const { useCase, order, locks } = harness();

    await useCase.execute(tx, TENANT_ID, data({ usageLimitPerCustomer: 2 }));

    expect(locks).toEqual([{ promotionId: 'promo-1', customerId: 'user-1' }]);
    expect(order.indexOf('lockPerCustomer')).toBeLessThan(
      order.indexOf('countActiveByCustomer'),
    );
  });

  it('spends no lock when the promotion has no per-customer cap', async () => {
    const { useCase, locks } = harness();

    await useCase.execute(tx, TENANT_ID, data());

    expect(locks).toEqual([]);
  });

  it('REFUSES once the customer has used their allowance', async () => {
    const { useCase, claims } = harness({ used: 2 });

    await expect(
      useCase.execute(tx, TENANT_ID, data({ usageLimitPerCustomer: 2 })),
    ).rejects.toThrow();
    expect(claims).toEqual([]);
  });

  it('allows the use that reaches the cap exactly', async () => {
    // At 1 of 2 used, this booking is the second and last permitted one.
    const { useCase, claims } = harness({ used: 1 });

    await useCase.execute(tx, TENANT_ID, data({ usageLimitPerCustomer: 2 }));

    expect(claims).toEqual(['promo-1']);
  });

  it('REFUSES when it loses the race for the last TOTAL use', async () => {
    // The claim is a conditional update; a false return means someone else took
    // it, and the booking must roll back rather than be given a free discount.
    const { useCase, reservations } = harness({ claimed: false });

    await expect(useCase.execute(tx, TENANT_ID, data())).rejects.toThrow();
    expect(reservations).toEqual([]);
  });

  it('claims the usage BEFORE recording the redemption', async () => {
    // Recording first would leave a redemption row for a use that was never
    // granted.
    const { useCase, order } = harness();

    await useCase.execute(tx, TENANT_ID, data());

    expect(order.indexOf('claimUsage')).toBeLessThan(order.indexOf('reserve'));
  });

  it('records the redemption for this booking and customer', async () => {
    const { useCase, reservations } = harness();

    await useCase.execute(tx, TENANT_ID, data());

    expect(reservations).toHaveLength(1);
    expect(JSON.stringify(reservations[0], (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toContain(
      'booking-1',
    );
  });
});
