import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { updatePromotionInputSchema } from '@booking/contracts';
import type { PrismaTx, TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IPromotionRepository,
  PromotionRecord,
  UpdatePromotionData,
} from '../../domain/ports/promotion-repository.port';
import type { IPromoContextLookup } from '../../domain/ports/promo-context-lookup.port';
import type { PromoAppliesTo } from '../../domain/promotion-discount';
import { PROMO_SCOPE_TARGET_INVALID_CODE } from '../assert-scope-target';
import { UpdatePromotionUseCase } from './update-promotion.use-case';

/**
 * The use case runs the §12.4 tenant-share guard, which reads commission rules off the
 * tx. No rules configured → the guard is a documented no-op, keeping these specs on the
 * clearing/scope behaviour they are actually about.
 */
const TX = { commissionRule: { findMany: async () => [] } } as unknown as PrismaTx;
const TENANT = 'tenant-1';
const PROMO_ID = 'promo-1';
// Real uuids: `appliesToId` is `uuidSchema`, so the contract rejects anything else.
const LISTING_ID = '0195f1a0-0000-7000-8000-000000000001';
const CATEGORY_ID = '0195f1a0-0000-7000-8000-000000000002';

/** A stored promotion that has every optional condition SET — the "before" of set → clear → read. */
function stored(overrides: Partial<PromotionRecord> = {}): PromotionRecord {
  return {
    id: PROMO_ID,
    tenantId: TENANT,
    name: 'Cuối tuần',
    code: 'WEEKEND20',
    discountType: 'percent',
    discountValue: 20n,
    maxDiscount: 500_000n,
    fundedBy: 'tenant',
    appliesTo: 'all',
    appliesToId: null,
    minOrderAmount: 200_000n,
    firstBookingOnly: false,
    usageLimitTotal: 500,
    usageLimitPerCustomer: 1,
    timeWindows: [{ days: [6, 0], from: '18:00', to: '22:00' }],
    redeemedCount: 0,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-12-31T00:00:00Z'),
    status: 'active',
    createdByPartnerId: null,
    fundingPartnerId: null,
    partnerOptInAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PromotionRecord;
}

function build(existing: PromotionRecord = stored()) {
  // The fake persists what update() is told, so a spec can read the promotion back and
  // assert the clear actually stuck rather than only that the repo was called.
  let state = existing;
  const promotions = {
    findById: vi.fn(async () => state),
    findByCode: vi.fn(async () => null),
    update: vi.fn(async (_tx: PrismaTx, _id: string, data: UpdatePromotionData) => {
      state = { ...state, ...data } as PromotionRecord;
      return state;
    }),
  } as unknown as IPromotionRepository;

  const lookup = {
    // Only ids of the *matching* type resolve — everything else is a cross-type id.
    resolveScopeTargetLabel: vi.fn(async (_tx: PrismaTx, appliesTo: PromoAppliesTo, id: string) => {
      if (appliesTo === 'listing' && id === LISTING_ID) return 'Studio A';
      if (appliesTo === 'category' && id === CATEGORY_ID) return 'Chụp ảnh';
      return null;
    }),
    getPartnerName: vi.fn(async () => 'Đối tác A'),
    listCategories: vi.fn(async () => []),
  } as unknown as IPromoContextLookup;

  const tenantDb = {
    forTenant: vi.fn((_t: string, fn: (tx: PrismaTx) => Promise<unknown>) => fn(TX)),
  } as unknown as TenantDbService;

  const useCase = new UpdatePromotionUseCase(promotions, lookup, tenantDb);
  return { useCase, promotions, lookup, read: (): PromotionRecord => state };
}

/** Parse through the real contract — the absent-vs-null distinction must survive it. */
function patch(body: unknown) {
  const parsed = updatePromotionInputSchema.safeParse(body);
  if (!parsed.success) throw new Error(`fixture rejected by contract: ${parsed.error.message}`);
  return parsed.data;
}

describe('UpdatePromotionUseCase — clearing an optional condition (§12.2)', () => {
  it('clears maxDiscount when sent as null: set → clear → read', async () => {
    const { useCase, read } = build();
    expect(read().maxDiscount).toBe(500_000n); // set

    await useCase.execute(TENANT, PROMO_ID, patch({ maxDiscount: null })); // clear

    expect(read().maxDiscount).toBeNull(); // read
  });

  it('clears every optional condition in one patch', async () => {
    const { useCase, read } = build();

    await useCase.execute(
      TENANT,
      PROMO_ID,
      patch({
        maxDiscount: null,
        minOrderAmount: null,
        usageLimitTotal: null,
        usageLimitPerCustomer: null,
        timeWindows: null,
        startsAt: null,
        endsAt: null,
      }),
    );

    const after = read();
    expect(after.maxDiscount).toBeNull();
    expect(after.minOrderAmount).toBeNull();
    expect(after.usageLimitTotal).toBeNull();
    expect(after.usageLimitPerCustomer).toBeNull();
    expect(after.timeWindows).toBeNull();
    expect(after.startsAt).toBeNull();
    expect(after.endsAt).toBeNull();
  });

  it('leaves a condition untouched when the field is absent', async () => {
    const { useCase, promotions, read } = build();

    await useCase.execute(TENANT, PROMO_ID, patch({ name: 'Đổi tên' }));

    // Absent must not even reach the write payload, or it would overwrite with null.
    const data = vi.mocked(promotions.update).mock.calls[0]?.[2] as UpdatePromotionData;
    expect('maxDiscount' in data).toBe(false);
    expect('timeWindows' in data).toBe(false);
    expect(read().maxDiscount).toBe(500_000n);
    expect(read().usageLimitTotal).toBe(500);
  });

  it('treats an empty time-window array as a clear', async () => {
    const { useCase, read } = build();
    await useCase.execute(TENANT, PROMO_ID, patch({ timeWindows: [] }));
    expect(read().timeWindows).toBeNull();
  });

  it('still updates a condition to a new value', async () => {
    const { useCase, read } = build();
    await useCase.execute(TENANT, PROMO_ID, patch({ maxDiscount: '100000', usageLimitTotal: 10 }));
    expect(read().maxDiscount).toBe(100_000n);
    expect(read().usageLimitTotal).toBe(10);
  });
});

describe('UpdatePromotionUseCase — appliesToId must match appliesTo (§12.2)', () => {
  it('rejects a category id submitted under a listing scope', async () => {
    const { useCase, promotions } = build();

    await expect(
      useCase.execute(TENANT, PROMO_ID, patch({ appliesTo: 'listing', appliesToId: CATEGORY_ID })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(promotions.update).not.toHaveBeenCalled();
  });

  it('rejects the stale id the form used to carry across a scope change', async () => {
    // The exact shape of the form bug: the promo was scoped to a category, funding flips
    // to `partner` which forces appliesTo=`listing`, and the category id rides along.
    const { useCase, promotions } = build(stored({ appliesTo: 'category', appliesToId: CATEGORY_ID }));

    await expect(
      useCase.execute(TENANT, PROMO_ID, patch({ appliesTo: 'listing', appliesToId: CATEGORY_ID })),
    ).rejects.toMatchObject({ response: { code: PROMO_SCOPE_TARGET_INVALID_CODE } });
    expect(promotions.update).not.toHaveBeenCalled();
  });

  it('accepts an id that does resolve to the declared type', async () => {
    const { useCase, read } = build();
    await useCase.execute(TENANT, PROMO_ID, patch({ appliesTo: 'listing', appliesToId: LISTING_ID }));
    expect(read().appliesTo).toBe('listing');
    expect(read().appliesToId).toBe(LISTING_ID);
  });

  it('needs no target for the `all` scope', async () => {
    const { useCase, lookup, read } = build(stored({ appliesTo: 'listing', appliesToId: LISTING_ID }));
    await useCase.execute(TENANT, PROMO_ID, patch({ appliesTo: 'all' }));
    expect(read().appliesToId).toBeNull();
    expect(lookup.resolveScopeTargetLabel).not.toHaveBeenCalled();
  });
});
