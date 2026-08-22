import { describe, expect, it } from 'vitest';
import type { CreatePartnerPromotionInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { NewPromotion } from '../../domain/entities/promotion.entity';
import {
  PromotionCodeTaken,
  PromoScopeNotOwned,
  PromoScopeRequired,
  PromoScopeUnsupported,
} from '../../domain/errors/promotion-errors';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { CreatePartnerPromotionUseCase } from './create-partner-promotion.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

function harness(options: { codeTaken?: boolean; listingOwner?: string } = {}) {
  const created: NewPromotion[] = [];
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
    useCase: new CreatePartnerPromotionUseCase(
      fakePort<IPromotionRepository>({
        findByCode: () =>
          Promise.resolve(options.codeTaken ? ({ id: 'promo-2' } as PromotionRecord) : null),
        create: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve({ id: 'promo-new', ...data } as unknown as PromotionRecord);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    created,
  };
}

const input = (overrides: Partial<CreatePartnerPromotionInput> = {}) =>
  ({
    name: 'Giảm 10%',
    code: 'GIANG10',
    discountType: 'percent',
    discountValue: '10',
    appliesTo: 'partner',
    firstBookingOnly: false,
    storefrontVisible: true,
    status: 'active',
    ...overrides,
  }) as unknown as CreatePartnerPromotionInput;

describe('CreatePartnerPromotionUseCase', () => {
  it('refuses a code another promotion already holds', async () => {
    const { useCase, created } = harness({ codeTaken: true });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input()),
    ).rejects.toBeInstanceOf(PromotionCodeTaken);
    expect(created).toEqual([]);
  });

  it('is always PARTNER-funded and AUTO-opted-in', async () => {
    // The partner creating it is the consent; there is nobody else to ask.
    const { useCase, created, tenantDb } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      fundedBy: 'partner',
      createdByPartnerId: PARTNER_ID,
      fundingPartnerId: PARTNER_ID,
    });
    expect(created[0]?.partnerOptInAt).toBeInstanceOf(Date);
  });

  it('scopes a `partner` promotion to the partner ITSELF', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input({ appliesTo: 'partner' }));

    expect(created[0]).toMatchObject({ appliesTo: 'partner', appliesToId: PARTNER_ID });
  });

  it('REFUSES a wide scope that would span other partners', async () => {
    // A partner cannot discount inventory it does not own.
    for (const appliesTo of ['all', 'listing_type', 'category'] as const) {
      const { useCase, created } = harness();

      await expect(
        useCase.execute(TENANT_ID, PARTNER_ID, input({ appliesTo, appliesToId: 'x' })),
      ).rejects.toBeInstanceOf(PromoScopeUnsupported);
      expect(created).toEqual([]);
    }
  });

  it("REFUSES another partner's listing", async () => {
    const { useCase, created } = harness({ listingOwner: 'partner-2' });

    await expect(
      useCase.execute(
        TENANT_ID,
        PARTNER_ID,
        input({ appliesTo: 'listing', appliesToId: 'listing-1' }),
      ),
    ).rejects.toBeInstanceOf(PromoScopeNotOwned);
    expect(created).toEqual([]);
  });

  it('refuses a listing scope with no listing named', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input({ appliesTo: 'listing' })),
    ).rejects.toBeInstanceOf(PromoScopeRequired);
  });

  it("accepts the partner's own listing", async () => {
    const { useCase, created } = harness();

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      input({ appliesTo: 'listing', appliesToId: 'listing-1' }),
    );

    expect(created[0]).toMatchObject({ appliesTo: 'listing', appliesToId: 'listing-1' });
  });

  it('forces a code-less promotion off the storefront', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input({ code: null, storefrontVisible: true }));

    expect(created[0]).toMatchObject({ code: null, storefrontVisible: false });
  });

  it('normalises the code and parses the money as bigint', async () => {
    const { useCase, created } = harness();

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      input({ code: ' giang10 ', discountType: 'fixed', discountValue: '50000', maxDiscount: '100000' }),
    );

    expect(created[0]).toMatchObject({
      code: 'GIANG10',
      discountValue: 50_000n,
      maxDiscount: 100_000n,
    });
  });
});
