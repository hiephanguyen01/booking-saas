import { describe, expect, it } from 'vitest';
import type { AutoCampaignInput } from '@booking/contracts';
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
import { ResolveAutoCampaignUseCase } from './resolve-auto-campaign.use-case';

const SCOPE: ListingScope = {
  listingId: 'listing-1',
  listingTypeId: 'type-1',
  groupId: null,
  categoryId: 'cat-1',
  partnerId: 'partner-1',
  timezone: 'Asia/Ho_Chi_Minh',
};

const campaign = (overrides: Record<string, unknown> = {}): PromotionRecord =>
  ({
    id: 'promo-1',
    name: 'Khuyến mãi hè',
    code: null,
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
    useCase: new ResolveAutoCampaignUseCase(
      fakePort<IPromotionRepository>({
        listActiveAutoCampaigns: () => Promise.resolve(options.candidates ?? [campaign()]),
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

const input = (overrides: Partial<AutoCampaignInput> = {}) =>
  ({ listingId: 'listing-1', amount: '1000000', ...overrides }) as AutoCampaignInput;

describe('ResolveAutoCampaignUseCase', () => {
  it('answers null for a missing listing', async () => {
    const { useCase } = harness({ scope: null });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toBeNull();
  });

  it('answers null when no campaign applies', async () => {
    const { useCase } = harness({ candidates: [campaign({ minOrderAmount: 5_000_000n })] });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toBeNull();
  });

  it('picks the BEST campaign and names it for the price line', async () => {
    const { useCase, tenantDb } = harness({
      candidates: [
        campaign({ id: 'p1', name: 'Nhỏ', discountValue: 5n }),
        campaign({ id: 'p2', name: 'Lớn', discountValue: 20n }),
      ],
    });

    const result = await useCase.execute('studiohub.vn', input());

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(result).toEqual({
      promotionId: 'p2',
      name: 'Lớn',
      discountAmount: '200000',
      finalAmount: '800000',
    });
  });

  it('IGNORES a campaign that carries a code', async () => {
    // A code is customer-entered; auto-applying it would give away a targeted
    // voucher to everyone.
    const { useCase } = harness({ candidates: [campaign({ code: 'SALE10' })] });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toBeNull();
  });

  it('matches a time window against the SLOT start, not against now', async () => {
    // The campaign applies to when the customer will use the service. Monday
    // 2026-09-14 08:30 Asia/Ho_Chi_Minh is 01:30Z — inside the window.
    const { useCase } = harness({
      candidates: [campaign({ timeWindows: [{ days: [1], from: '08:00', to: '09:00' }] })],
    });

    await expect(
      useCase.execute('studiohub.vn', input({ start: '2026-09-14T01:30:00.000Z' })),
    ).resolves.toMatchObject({ promotionId: 'promo-1' });
  });

  it('drops a windowed campaign when the slot falls outside it', async () => {
    const { useCase } = harness({
      candidates: [campaign({ timeWindows: [{ days: [1], from: '08:00', to: '09:00' }] })],
    });

    // Thursday, not Monday.
    await expect(
      useCase.execute('studiohub.vn', input({ start: '2026-09-10T01:30:00.000Z' })),
    ).resolves.toBeNull();
  });

  it('drops a windowed campaign when no slot was supplied at all', async () => {
    // Windows are configured but the slot is unknown, so it cannot be confirmed.
    const { useCase } = harness({
      candidates: [campaign({ timeWindows: [{ days: [1], from: '08:00', to: '09:00' }] })],
    });

    await expect(useCase.execute('studiohub.vn', input())).resolves.toBeNull();
  });
});
