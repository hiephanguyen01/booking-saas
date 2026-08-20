import { describe, expect, it } from 'vitest';
import type { StorefrontPromotionsInput } from '@booking/contracts';
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
import { ListStorefrontPromotionsUseCase } from './list-storefront-promotions.use-case';

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

function harness(options: { scope?: ListingScope | null; candidates?: PromotionRecord[] } = {}) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListStorefrontPromotionsUseCase(
      fakePort<IPromotionRepository>({
        listStorefrontVisibleCodes: () =>
          Promise.resolve(options.candidates ?? [promotion()]),
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
  };
}

const input = (overrides: Partial<StorefrontPromotionsInput> = {}) =>
  ({ listingId: 'listing-1', amount: '1000000', ...overrides }) as StorefrontPromotionsInput;

describe('ListStorefrontPromotionsUseCase', () => {
  it('answers an empty list for a missing listing', async () => {
    const { useCase } = harness({ scope: null });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toEqual([]);
  });

  it('SHOWS an ineligible voucher rather than hiding it', async () => {
    // The customer needs to know a voucher exists and why it does not apply —
    // hiding it reads as "there are no offers".
    const { useCase } = harness({
      candidates: [promotion({ minOrderAmount: 5_000_000n })],
    });

    const result = await useCase.execute('studiohub.vn', input());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      code: 'SALE10',
      eligible: false,
      discountAmount: '0',
    });
  });

  it('computes the discount for an eligible voucher', async () => {
    const { useCase, tenantDb } = harness();

    const result = await useCase.execute('studiohub.vn', input());

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(result[0]).toMatchObject({
      eligible: true,
      discountAmount: '100000',
      finalAmount: '900000',
    });
  });

  it('DROPS a code-less campaign — there is no code to type', async () => {
    const { useCase } = harness({ candidates: [promotion({ code: null })] });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toEqual([]);
  });

  it('sorts ELIGIBLE vouchers first, then by biggest discount', async () => {
    const { useCase } = harness({
      candidates: [
        promotion({ id: 'p1', code: 'SMALL', name: 'Nhỏ', discountValue: 5n }),
        promotion({
          id: 'p2',
          code: 'BLOCKED',
          name: 'Chặn',
          minOrderAmount: 5_000_000n,
          discountValue: 50n,
        }),
        promotion({ id: 'p3', code: 'BIG', name: 'Lớn', discountValue: 20n }),
      ],
    });

    const result = await useCase.execute('studiohub.vn', input());

    expect(result.map((r) => r.code)).toEqual(['BIG', 'SMALL', 'BLOCKED']);
  });

  it('puts an ELIGIBLE zero-discount voucher above an ineligible one', async () => {
    // Both report a zero discount, so only the eligibility rule can order them —
    // and a voucher the customer can actually use belongs first.
    const { useCase } = harness({
      candidates: [
        promotion({ id: 'p1', code: 'BLOCKED', name: 'Alpha', minOrderAmount: 5_000_000n }),
        promotion({ id: 'p2', code: 'USABLE', name: 'Zeta', discountType: 'fixed', discountValue: 0n }),
      ],
    });

    const result = await useCase.execute('studiohub.vn', input());

    expect(result.map((r) => r.code)).toEqual(['USABLE', 'BLOCKED']);
  });

  it('breaks a discount tie by NAME, in Vietnamese collation', async () => {
    const { useCase } = harness({
      candidates: [
        promotion({ id: 'p1', code: 'B', name: 'Ưu đãi B' }),
        promotion({ id: 'p2', code: 'A', name: 'Áo mới' }),
      ],
    });

    const result = await useCase.execute('studiohub.vn', input());

    expect(result.map((r) => r.code)).toEqual(['A', 'B']);
  });

  it('renders money as strings and dates as ISO, with nulls preserved', async () => {
    const { useCase } = harness({
      candidates: [
        promotion({
          maxDiscount: 50_000n,
          minOrderAmount: null,
          startsAt: new Date('2026-09-01T00:00:00Z'),
          endsAt: null,
        }),
      ],
    });

    const result = await useCase.execute('studiohub.vn', input());

    expect(result[0]).toMatchObject({
      maxDiscount: '50000',
      minOrderAmount: null,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: null,
    });
  });
});
