import { describe, expect, it } from 'vitest';
import type { UpdatePartnerPromotionInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import {
  PromoScopeNotOwned,
  PromotionCodeTaken,
  PromotionEnded,
  PromotionNotFound,
  PromotionNotOwned,
} from '../../domain/errors/promotion-errors';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { UpdatePartnerPromotionUseCase } from './update-partner-promotion.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const PROMO_ID = 'promo-1';

const stored = (overrides: Record<string, unknown> = {}): PromotionRecord =>
  ({
    id: PROMO_ID,
    name: 'Giảm 10%',
    code: 'GIANG10',
    discountType: 'percent',
    discountValue: 10n,
    maxDiscount: null,
    fundedBy: 'partner',
    appliesTo: 'partner',
    appliesToId: PARTNER_ID,
    createdByPartnerId: PARTNER_ID,
    fundingPartnerId: PARTNER_ID,
    partnerOptInAt: new Date('2026-01-01T00:00:00Z'),
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

function harness(
  options: { existing?: PromotionRecord | null; clash?: PromotionRecord | null; listingOwner?: string } = {},
) {
  const updates: Array<Record<string, unknown>> = [];
  const tx = fakeTx({
    listing: {
      findUnique: () => Promise.resolve({ partnerId: options.listingOwner ?? PARTNER_ID }),
    },
    listingGroup: {
      findUnique: () => Promise.resolve({ partnerId: options.listingOwner ?? PARTNER_ID }),
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new UpdatePartnerPromotionUseCase(
      fakePort<IPromotionRepository>({
        findById: () => Promise.resolve(options.existing === undefined ? stored() : options.existing),
        findByCode: () => Promise.resolve(options.clash ?? null),
        update: (_tx, id, data) => {
          updates.push(data as Record<string, unknown>);
          return Promise.resolve({ ...stored(), id, ...data } as PromotionRecord);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    updates,
  };
}

const input = (overrides: Partial<UpdatePartnerPromotionInput> = {}) =>
  overrides as UpdatePartnerPromotionInput;

describe('UpdatePartnerPromotionUseCase', () => {
  it('answers not-found for an unknown promotion', async () => {
    const { useCase, updates } = harness({ existing: null });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, input({ name: 'Mới' })),
    ).rejects.toBeInstanceOf(PromotionNotFound);
    expect(updates).toEqual([]);
  });

  it("refuses a promotion ANOTHER partner created", async () => {
    const { useCase, updates } = harness({ existing: stored({ createdByPartnerId: 'partner-2' }) });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, input({ name: 'Mới' })),
    ).rejects.toBeInstanceOf(PromotionNotOwned);
    expect(updates).toEqual([]);
  });

  it('refuses a tenant-created promotion the partner merely funds', async () => {
    // Funding it is not owning it.
    const { useCase } = harness({
      existing: stored({ createdByPartnerId: null, fundingPartnerId: PARTNER_ID }),
    });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, input({ name: 'Mới' })),
    ).rejects.toBeInstanceOf(PromotionNotOwned);
  });

  it('refuses to edit an ended promotion', async () => {
    const { useCase } = harness({ existing: stored({ status: 'ended' }) });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, input({ name: 'Mới' })),
    ).rejects.toBeInstanceOf(PromotionEnded);
  });

  it("REFUSES to re-scope onto another partner's listing", async () => {
    const { useCase, updates } = harness({ listingOwner: 'partner-2' });

    await expect(
      useCase.execute(
        TENANT_ID,
        PARTNER_ID,
        PROMO_ID,
        input({ appliesTo: 'listing', appliesToId: 'listing-1' }),
      ),
    ).rejects.toBeInstanceOf(PromoScopeNotOwned);
    expect(updates).toEqual([]);
  });

  it('keeps the funding partner on the partner after a re-scope', async () => {
    // It is still the partner's own inventory, and its own money.
    const { useCase, updates } = harness();

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      PROMO_ID,
      input({ appliesTo: 'listing', appliesToId: 'listing-1' }),
    );

    expect(updates[0]).toMatchObject({
      appliesTo: 'listing',
      appliesToId: 'listing-1',
      fundingPartnerId: PARTNER_ID,
    });
  });

  it('leaves the scope alone on an unrelated edit', async () => {
    const { useCase, updates } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, input({ name: 'Tên mới' }));

    expect(updates[0]).toMatchObject({ name: 'Tên mới' });
    expect(updates[0]).not.toHaveProperty('appliesTo');
  });

  it('refuses a code another promotion holds, but not its own', async () => {
    const clashing = harness({ clash: stored({ id: 'promo-2' }) });
    const itself = harness({ clash: stored() });

    await expect(
      clashing.useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, input({ code: 'OTHER' })),
    ).rejects.toBeInstanceOf(PromotionCodeTaken);
    await itself.useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, input({ code: 'OTHER' }));
    expect(itself.updates[0]).toMatchObject({ code: 'OTHER' });
  });

  it('takes a promotion off the storefront when its code is removed', async () => {
    const { useCase, updates } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, input({ code: null }));

    expect(updates[0]).toMatchObject({ code: null, storefrontVisible: false });
  });
});
