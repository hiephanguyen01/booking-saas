import { describe, expect, it } from 'vitest';
import { fakePort, fakeTx } from '~testing';
import { PromoRejectionError } from '../../domain/errors/promo-rejection-errors';
import type { PromoRejection, PromotionSpec } from '../../domain/promotion-discount';
import type {
  IPromoContextLookup,
  ListingScope,
} from '../../domain/ports/promo-context-lookup.port';
import type { IPromoRedemptionRepository } from '../../domain/ports/promo-redemption-repository.port';
import type { IPromotionRepository } from '../../domain/ports/promotion-repository.port';
import type { PreparePromotionParams } from '../../domain/promotion-application';
import { PreparePromotionUseCase } from './prepare-promotion.use-case';

const SCOPE: ListingScope = {
  listingId: 'listing-1',
  listingTypeId: 'type-1',
  groupId: null,
  categoryId: 'cat-1',
  partnerId: 'partner-1',
  timezone: 'Asia/Ho_Chi_Minh',
};

const promo = (overrides: Partial<PromotionSpec> = {}): PromotionSpec => ({
  id: 'promo-1',
  code: 'SALE10',
  discountType: 'percent',
  discountValue: 10n,
  maxDiscount: null,
  fundedBy: 'tenant',
  appliesTo: 'all',
  appliesToId: null,
  minOrderAmount: null,
  firstBookingOnly: false,
  usageLimitTotal: null,
  usageLimitPerCustomer: null,
  timeWindows: null,
  redeemedCount: 0,
  startsAt: null,
  endsAt: null,
  status: 'active',
  partnerOptInAt: null,
  ...overrides,
});

interface Options {
  scope?: ListingScope | null;
  byCode?: PromotionSpec | null;
  campaigns?: PromotionSpec[];
  customerRedemptions?: number;
  priorBookings?: number;
}

function harness(options: Options = {}) {
  const codes: string[] = [];
  const counted: Array<{ promotionId: string; customerId: string }> = [];
  return {
    useCase: new PreparePromotionUseCase(
      fakePort<IPromotionRepository>({
        findByCode: (_tx, code) => {
          codes.push(code);
          return Promise.resolve((options.byCode === undefined ? promo() : options.byCode) as never);
        },
        listActiveAutoCampaigns: () => Promise.resolve((options.campaigns ?? []) as never),
      }),
      fakePort<IPromoRedemptionRepository>({
        countActiveByCustomer: (_tx, promotionId, customerId) => {
          counted.push({ promotionId, customerId });
          return Promise.resolve(options.customerRedemptions ?? 0);
        },
      }),
      fakePort<IPromoContextLookup>({
        getListingScope: () =>
          Promise.resolve(options.scope === undefined ? SCOPE : options.scope),
        countPriorBookings: () => Promise.resolve(options.priorBookings ?? 0),
      }),
    ),
    codes,
    counted,
  };
}

const tx = fakeTx({});

/**
 * A bare `rejects.toThrow()` also passes on a TypeError, which is exactly what a
 * dropped rejection guard produces further down. Naming the code is what makes
 * the assertion mean "refused for this reason".
 */
async function expectRejection(
  promise: Promise<unknown>,
  rejection: PromoRejection,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(PromoRejectionError);
  expect((error as PromoRejectionError).code).toBe(rejection);
}

const params = (overrides: Partial<PreparePromotionParams> = {}) =>
  ({
    listingId: 'listing-1',
    customerId: 'user-1',
    amount: 1_000_000n,
    slotStart: new Date('2026-09-10T02:00:00Z'),
    ...overrides,
  }) as PreparePromotionParams;

describe('PreparePromotionUseCase', () => {
  it('answers null for a missing listing when no code was entered', async () => {
    const { useCase } = harness({ scope: null });

    await expect(useCase.execute(tx, params())).resolves.toBeNull();
  });

  it('THROWS for a missing listing when a code WAS entered', async () => {
    // The customer typed something; silently dropping it would show a price
    // they did not agree to.
    const { useCase } = harness({ scope: null });

    await expectRejection(useCase.execute(tx, params({ code: 'SALE10' })), 'PROMO_NOT_APPLICABLE');
  });

  it('normalises the entered code before looking it up', async () => {
    const { useCase, codes } = harness();

    await useCase.execute(tx, params({ code: '  sale10 ' }));

    expect(codes).toEqual(['SALE10']);
  });

  it('rejects an unknown code', async () => {
    const { useCase } = harness({ byCode: null });

    await expectRejection(useCase.execute(tx, params({ code: 'NOPE' })), 'PROMO_NOT_FOUND');
  });

  it('rejects a CODE-LESS campaign redeemed as a code', async () => {
    // Auto-campaigns are applied by the system; letting a customer name one
    // would leak campaigns they were not targeted by.
    const { useCase } = harness({ byCode: promo({ code: null }) });

    await expectRejection(useCase.execute(tx, params({ code: 'SALE10' })), 'PROMO_NOT_FOUND');
  });

  it('applies a valid code and snapshots the discount', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(tx, params({ code: 'SALE10' }));

    expect(result).toMatchObject({
      promotionId: 'promo-1',
      promoCode: 'SALE10',
      discountAmount: 100_000n,
      finalAmount: 900_000n,
    });
    expect(result?.snapshot).toBeTruthy();
  });

  it('lets a CODE beat an auto-campaign that would discount more', async () => {
    // §12.1 no-stacking, code-wins: the customer chose the code.
    const { useCase } = harness({
      campaigns: [promo({ id: 'promo-auto', code: null, discountValue: 50n })],
    });

    const result = await useCase.execute(tx, params({ code: 'SALE10' }));

    expect(result).toMatchObject({ promotionId: 'promo-1', discountAmount: 100_000n });
  });

  it('picks the BEST auto-campaign when no code was entered', async () => {
    const { useCase } = harness({
      campaigns: [
        promo({ id: 'promo-small', code: null, discountValue: 5n }),
        promo({ id: 'promo-big', code: null, discountValue: 20n }),
      ],
    });

    const result = await useCase.execute(tx, params());

    expect(result).toMatchObject({
      promotionId: 'promo-big',
      promoCode: null,
      discountAmount: 200_000n,
    });
  });

  it('answers null when no campaign applies and no code was entered', async () => {
    const { useCase } = harness({ campaigns: [] });

    await expect(useCase.execute(tx, params())).resolves.toBeNull();
  });

  it('checks the winner’s PER-CUSTOMER limit, which selection skipped', async () => {
    // Selection has no per-promo count, so the winner is re-checked once it is
    // known — otherwise a customer would silently exceed a campaign's cap.
    const { useCase, counted } = harness({
      campaigns: [promo({ id: 'promo-auto', code: null, usageLimitPerCustomer: 1 })],
      customerRedemptions: 1,
    });

    const result = await useCase.execute(tx, params());

    expect(result).toBeNull();
    expect(counted).toEqual([{ promotionId: 'promo-auto', customerId: 'user-1' }]);
  });

  it('spends no count query for a campaign with no per-customer cap', async () => {
    const { useCase, counted } = harness({
      campaigns: [promo({ id: 'promo-auto', code: null })],
    });

    await useCase.execute(tx, params());

    expect(counted).toEqual([]);
  });

  it('enforces first-booking-only against the customer’s history', async () => {
    const { useCase } = harness({
      byCode: promo({ firstBookingOnly: true }),
      priorBookings: 2,
    });

    await expectRejection(
      useCase.execute(tx, params({ code: 'SALE10' })),
      'PROMO_FIRST_BOOKING_ONLY',
    );
  });

  it('refuses a partner-funded promo the partner has not opted into', async () => {
    // §12.2: the partner pays for it, so it cannot apply before they agree.
    const { useCase } = harness({
      byCode: promo({ fundedBy: 'partner', partnerOptInAt: null }),
    });

    await expectRejection(
      useCase.execute(tx, params({ code: 'SALE10' })),
      'PROMO_NOT_OPTED_IN',
    );
  });

  it('enforces the code promo’s PER-CUSTOMER limit', async () => {
    // The count is fetched per promo and fed into the evaluation; without it a
    // customer could redeem a once-per-customer code repeatedly.
    const { useCase, counted } = harness({
      byCode: promo({ usageLimitPerCustomer: 1 }),
      customerRedemptions: 1,
    });

    await expectRejection(
      useCase.execute(tx, params({ code: 'SALE10' })),
      'PROMO_LIMIT_REACHED',
    );
    expect(counted).toEqual([{ promotionId: 'promo-1', customerId: 'user-1' }]);
  });

  it('CLAIMS no usage — that is the reservation’s job', async () => {
    // Preparing runs on every quote; claiming here would burn the allowance of
    // customers who never book.
    const claimed: string[] = [];
    const useCase = new PreparePromotionUseCase(
      fakePort<IPromotionRepository>({
        findByCode: () => Promise.resolve(promo() as never),
        claimUsage: (_tx, id) => {
          claimed.push(id);
          return Promise.resolve(true);
        },
      }),
      fakePort<IPromoRedemptionRepository>({
        countActiveByCustomer: () => Promise.resolve(0),
      }),
      fakePort<IPromoContextLookup>({
        getListingScope: () => Promise.resolve(SCOPE),
        countPriorBookings: () => Promise.resolve(0),
      }),
    );

    await useCase.execute(tx, params({ code: 'SALE10' }));

    expect(claimed).toEqual([]);
  });
});
