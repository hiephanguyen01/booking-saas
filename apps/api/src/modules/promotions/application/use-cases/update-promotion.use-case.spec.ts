import { describe, expect, it } from 'vitest';
import type { UpdatePromotionInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import {
  PromoScopeTargetInvalid,
  PromotionCodeTaken,
  PromotionEnded,
  PromotionNotFound,
  PromoTenantShareNegative,
} from '../../domain/errors/promotion-errors';
import type { IPromoContextLookup } from '../../domain/ports/promo-context-lookup.port';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { UpdatePromotionUseCase } from './update-promotion.use-case';

const TENANT_ID = 'tenant-1';
const PROMO_ID = 'promo-1';

const RULE = {
  appliesTo: 'tenant_default',
  tenantRateType: 'percent',
  tenantRate: 30,
  platformRate: 5,
  affiliateRateType: 'percent',
  affiliateRate: 0,
};

const stored = (overrides: Record<string, unknown> = {}): PromotionRecord =>
  ({
    id: PROMO_ID,
    name: 'Giảm 10%',
    code: 'SALE10',
    discountType: 'percent',
    discountValue: 10n,
    maxDiscount: null,
    fundedBy: 'tenant',
    appliesTo: 'all',
    appliesToId: null,
    fundingPartnerId: null,
    createdByPartnerId: null,
    partnerOptInAt: null,
    minOrderAmount: null,
    firstBookingOnly: false,
    storefrontVisible: true,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    timeWindows: null,
    startsAt: null,
    endsAt: null,
    status: 'active',
    ...overrides,
  }) as unknown as PromotionRecord;

interface Options {
  existing?: PromotionRecord | null;
  clash?: PromotionRecord | null;
  scopeLabel?: string | null;
}

function harness(options: Options = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const scopeChecks: Array<{ appliesTo: string; id: string }> = [];
  const tx = fakeTx({
    commissionRule: { findMany: () => Promise.resolve([RULE]) },
    listing: { findUnique: () => Promise.resolve({ partnerId: 'partner-1' }) },
    listingGroup: { findUnique: () => Promise.resolve({ partnerId: 'partner-1' }) },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new UpdatePromotionUseCase(
      fakePort<IPromotionRepository>({
        findById: () => Promise.resolve(options.existing === undefined ? stored() : options.existing),
        findByCode: () => Promise.resolve(options.clash ?? null),
        update: (_tx, id, data) => {
          updates.push(data as Record<string, unknown>);
          return Promise.resolve({ ...stored(), id, ...data } as PromotionRecord);
        },
      }),
      fakePort<IPromoContextLookup>({
        resolveScopeTargetLabel: (_tx, appliesTo, id) => {
          scopeChecks.push({ appliesTo, id });
          return Promise.resolve(
            options.scopeLabel === undefined ? 'Sân bóng số 1' : options.scopeLabel,
          );
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    updates,
    scopeChecks,
  };
}

const input = (overrides: Partial<UpdatePromotionInput> = {}) => overrides as UpdatePromotionInput;

describe('UpdatePromotionUseCase', () => {
  it('answers not-found for an unknown promotion', async () => {
    const { useCase, updates } = harness({ existing: null });

    await expect(
      useCase.execute(TENANT_ID, PROMO_ID, input({ name: 'Mới' })),
    ).rejects.toBeInstanceOf(PromotionNotFound);
    expect(updates).toEqual([]);
  });

  it('REFUSES to edit an ended promotion', async () => {
    // Its redemptions are already priced; changing the terms now would rewrite
    // what customers agreed to.
    const { useCase, updates } = harness({ existing: stored({ status: 'ended' }) });

    await expect(
      useCase.execute(TENANT_ID, PROMO_ID, input({ name: 'Mới' })),
    ).rejects.toBeInstanceOf(PromotionEnded);
    expect(updates).toEqual([]);
  });

  it('re-checks the tenant-share risk against the MERGED discount', async () => {
    // Raising only the value, leaving the stored type, still has to be checked.
    const { useCase, updates } = harness();

    await expect(
      useCase.execute(TENANT_ID, PROMO_ID, input({ discountValue: '90' })),
    ).rejects.toBeInstanceOf(PromoTenantShareNegative);
    expect(updates).toEqual([]);
  });

  it('leaves an untouched key alone', async () => {
    // `undefined` means "keep"; only what the caller sent is written.
    const { useCase, updates } = harness();

    await useCase.execute(TENANT_ID, PROMO_ID, input({ name: 'Tên mới' }));

    expect(updates[0]).toMatchObject({ name: 'Tên mới' });
    expect(updates[0]).not.toHaveProperty('discountValue');
  });

  it('validates the MERGED scope pair, not the input alone', async () => {
    // A client may change only `appliesTo` and leave a now-cross-type id behind.
    // Stored as a CATEGORY scope; the caller switches only `appliesTo`, so the
    // category uuid would be stored under a listing scope and match nothing.
    const { useCase, scopeChecks, updates } = harness({
      existing: stored({ appliesTo: 'category', appliesToId: 'cat-1' }),
      scopeLabel: null,
    });

    await expect(
      useCase.execute(TENANT_ID, PROMO_ID, input({ appliesTo: 'listing' })),
    ).rejects.toBeInstanceOf(PromoScopeTargetInvalid);
    expect(updates).toEqual([]);
    expect(scopeChecks).toEqual([{ appliesTo: 'listing', id: 'cat-1' }]);
  });

  it('spends no scope validation on an edit that does not touch the scope', async () => {
    // The stored promotion is narrowly scoped, so a validation would be visible
    // if one ran.
    const { useCase, scopeChecks } = harness({
      existing: stored({ appliesTo: 'listing', appliesToId: 'listing-1' }),
    });

    await useCase.execute(TENANT_ID, PROMO_ID, input({ name: 'Tên mới' }));

    expect(scopeChecks).toEqual([]);
  });

  it('CLEARS the target when the scope becomes `all`', async () => {
    const { useCase, updates } = harness({
      existing: stored({ appliesTo: 'listing', appliesToId: 'listing-1' }),
    });

    await useCase.execute(TENANT_ID, PROMO_ID, input({ appliesTo: 'all' }));

    expect(updates[0]).toMatchObject({ appliesTo: 'all', appliesToId: null });
  });

  it('resolves the funding partner when the funding changes to partner', async () => {
    const { useCase, updates } = harness({
      existing: stored({ appliesTo: 'listing', appliesToId: 'listing-1' }),
    });

    await useCase.execute(TENANT_ID, PROMO_ID, input({ fundedBy: 'partner' }));

    expect(updates[0]).toMatchObject({ fundingPartnerId: 'partner-1' });
  });

  it('clears the funding partner when the funding goes back to the tenant', async () => {
    const { useCase, updates } = harness({
      existing: stored({ fundedBy: 'partner', fundingPartnerId: 'partner-1' }),
    });

    await useCase.execute(TENANT_ID, PROMO_ID, input({ fundedBy: 'tenant' }));

    expect(updates[0]).toMatchObject({ fundingPartnerId: null });
  });

  it('refuses a code another promotion holds', async () => {
    const { useCase, updates } = harness({ clash: stored({ id: 'promo-2' }) });

    await expect(
      useCase.execute(TENANT_ID, PROMO_ID, input({ code: 'OTHER' })),
    ).rejects.toBeInstanceOf(PromotionCodeTaken);
    expect(updates).toEqual([]);
  });

  it('does not report the promotion as clashing with ITSELF', async () => {
    const { useCase, updates } = harness({ clash: stored() });

    await useCase.execute(TENANT_ID, PROMO_ID, input({ code: 'OTHER' }));

    expect(updates[0]).toMatchObject({ code: 'OTHER' });
  });

  it('normalises a new code', async () => {
    const { useCase, updates } = harness();

    await useCase.execute(TENANT_ID, PROMO_ID, input({ code: ' other ' }));

    expect(updates[0]).toMatchObject({ code: 'OTHER' });
  });

  it('turns a coded promo into a code-less campaign, and takes it off the storefront', async () => {
    // There is no code left to display.
    const { useCase, updates } = harness();

    await useCase.execute(TENANT_ID, PROMO_ID, input({ code: null }));

    expect(updates[0]).toMatchObject({ code: null, storefrontVisible: false });
  });

  it('keeps an already code-less campaign off the storefront on an unrelated edit', async () => {
    const { useCase, updates } = harness({ existing: stored({ code: null }) });

    await useCase.execute(TENANT_ID, PROMO_ID, input({ name: 'Tên mới' }));

    expect(updates[0]).toMatchObject({ storefrontVisible: false });
  });
});
