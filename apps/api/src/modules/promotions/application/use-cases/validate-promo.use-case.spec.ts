import { describe, expect, it } from 'vitest';
import type { ValidatePromoInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type {
  IPromoContextLookup,
  ListingScope,
} from '../../domain/ports/promo-context-lookup.port';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { ValidatePromoUseCase } from './validate-promo.use-case';

const SCOPE: ListingScope = {
  listingId: 'listing-1',
  listingTypeId: 'type-1',
  groupId: null,
  categoryId: 'cat-1',
  partnerId: 'partner-1',
  timezone: 'Asia/Ho_Chi_Minh',
};

const promotion = (overrides: Record<string, unknown> = {}): PromotionRecord =>
  ({
    id: 'promo-1',
    name: 'Giảm 10%',
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
  }) as unknown as PromotionRecord;

interface Options {
  scope?: ListingScope | null;
  promo?: PromotionRecord | null;
}

function harness(options: Options = {}) {
  const codes: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ValidatePromoUseCase(
      fakePort<IPromotionRepository>({
        findByCode: (_tx, code) => {
          codes.push(code);
          return Promise.resolve(options.promo === undefined ? promotion() : options.promo);
        },
      }),
      fakePort<IPromoContextLookup>({
        getListingScope: () =>
          Promise.resolve(options.scope === undefined ? SCOPE : options.scope),
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: 'tenant-9' }),
      }),
      tenantDb.service,
    ),
    tenantDb,
    codes,
  };
}

const input = (overrides: Partial<ValidatePromoInput> = {}) =>
  ({ code: 'SALE10', listingId: 'listing-1', amount: '1000000', ...overrides }) as ValidatePromoInput;

describe('ValidatePromoUseCase', () => {
  it('answers a REJECTION rather than an HTTP error', async () => {
    // The checkout form messages the customer inline; a 4xx would blank the
    // page instead.
    const { useCase } = harness({ promo: null });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toEqual({
      valid: false,
      discountAmount: '0',
      finalAmount: '1000000',
      code: 'SALE10',
      error: 'PROMO_NOT_FOUND',
    });
  });

  it('answers not-applicable for a missing listing', async () => {
    const { useCase } = harness({ scope: null });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toMatchObject({
      valid: false,
      error: 'PROMO_NOT_APPLICABLE',
    });
  });

  it('rejects a code-less campaign named as a code', async () => {
    const { useCase } = harness({ promo: promotion({ code: null }) });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toMatchObject({
      error: 'PROMO_NOT_FOUND',
    });
  });

  it('normalises the code, and echoes the NORMALISED form back', async () => {
    const { useCase, codes } = harness();

    const result = await useCase.execute('studiohub.vn', input({ code: ' sale10 ' }));

    expect(codes).toEqual(['SALE10']);
    expect(result.code).toBe('SALE10');
  });

  it('computes the discount for a valid code', async () => {
    const { useCase, tenantDb } = harness();

    const result = await useCase.execute('studiohub.vn', input());

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(result).toEqual({
      valid: true,
      discountAmount: '100000',
      finalAmount: '900000',
      code: 'SALE10',
    });
  });

  it('surfaces the specific reason a code does not apply', async () => {
    // The customer needs to know it is the minimum order, not a typo.
    const { useCase } = harness({ promo: promotion({ minOrderAmount: 5_000_000n }) });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toMatchObject({
      error: 'PROMO_MIN_ORDER',
    });
  });

  it('does NOT check first-booking-only — there is no customer identity here', async () => {
    // The preview is unauthenticated; that rule is enforced authoritatively at
    // booking creation instead of guessed at.
    const { useCase } = harness({ promo: promotion({ firstBookingOnly: true }) });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toMatchObject({
      valid: true,
    });
  });

  it('does not check the per-customer limit either', async () => {
    const { useCase } = harness({ promo: promotion({ usageLimitPerCustomer: 1 }) });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toMatchObject({
      valid: true,
    });
  });

  it('matches a time window against the SLOT the customer picked', async () => {
    // Monday 2026-09-14 08:30 Asia/Ho_Chi_Minh is 01:30Z — inside the window.
    const { useCase } = harness({
      promo: promotion({ timeWindows: [{ days: [1], from: '08:00', to: '09:00' }] }),
    });

    await expect(
      useCase.execute('studiohub.vn', input({ start: '2026-09-14T01:30:00.000Z' })),
    ).resolves.toMatchObject({ valid: true });
  });

  it('reports a slot outside the window, and one with no slot at all', async () => {
    const { useCase } = harness({
      promo: promotion({ timeWindows: [{ days: [1], from: '08:00', to: '09:00' }] }),
    });

    // Thursday rather than Monday.
    await expect(
      useCase.execute('studiohub.vn', input({ start: '2026-09-10T01:30:00.000Z' })),
    ).resolves.toMatchObject({ error: 'PROMO_TIME_WINDOW' });
    await expect(useCase.execute('studiohub.vn', input())).resolves.toMatchObject({
      error: 'PROMO_TIME_WINDOW',
    });
  });

  it('DOES check the total usage limit, which needs no identity', async () => {
    const { useCase } = harness({
      promo: promotion({ usageLimitTotal: 10, redeemedCount: 10 }),
    });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toMatchObject({
      error: 'PROMO_LIMIT_REACHED',
    });
  });
});
