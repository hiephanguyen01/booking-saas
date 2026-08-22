import { describe, expect, it } from 'vitest';
import type { CreatePromotionInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { NewPromotion } from '../../domain/entities/promotion.entity';
import {
  PromoFundingPartnerUnresolved,
  PromoScopeTargetInvalid,
  PromoScopeTargetMissing,
  PromoTenantShareNegative,
  PromotionCodeTaken,
} from '../../domain/errors/promotion-errors';
import type { IPromoContextLookup } from '../../domain/ports/promo-context-lookup.port';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { CreatePromotionUseCase } from './create-promotion.use-case';

const TENANT_ID = 'tenant-1';

/** Tenant keeps 30%, platform takes 5, affiliate 0 — a 10% discount is safe. */
const RULE = {
  appliesTo: 'tenant_default',
  tenantRateType: 'percent',
  tenantRate: 30,
  platformRate: 5,
  affiliateRateType: 'percent',
  affiliateRate: 0,
};

interface Options {
  codeTaken?: boolean;
  scopeLabel?: string | null;
  rules?: unknown[];
  listingPartnerId?: string | null;
}

function harness(options: Options = {}) {
  const created: NewPromotion[] = [];
  const scopeChecks: Array<{ appliesTo: string; id: string }> = [];
  const tx = fakeTx({
    commissionRule: { findMany: () => Promise.resolve(options.rules ?? [RULE]) },
    listing: {
      findUnique: () =>
        Promise.resolve(
          options.listingPartnerId === undefined
            ? { partnerId: 'partner-1' }
            : options.listingPartnerId === null
              ? null
              : { partnerId: options.listingPartnerId },
        ),
    },
    listingGroup: { findUnique: () => Promise.resolve({ partnerId: 'partner-1' }) },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new CreatePromotionUseCase(
      fakePort<IPromotionRepository>({
        findByCode: () =>
          Promise.resolve(options.codeTaken ? ({ id: 'promo-2' } as PromotionRecord) : null),
        create: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve({ id: 'promo-new', ...data } as unknown as PromotionRecord);
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
    created,
    scopeChecks,
  };
}

const input = (overrides: Partial<CreatePromotionInput> = {}) =>
  ({
    name: 'Giảm 10%',
    code: 'SALE10',
    discountType: 'percent',
    discountValue: '10',
    fundedBy: 'tenant',
    appliesTo: 'all',
    firstBookingOnly: false,
    storefrontVisible: true,
    status: 'active',
    ...overrides,
  }) as unknown as CreatePromotionInput;

describe('CreatePromotionUseCase', () => {
  it('refuses a code another promotion already holds', async () => {
    const { useCase, created } = harness({ codeTaken: true });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(
      PromotionCodeTaken,
    );
    expect(created).toEqual([]);
  });

  it('normalises the code before storing and before the collision check', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ code: ' sale10 ' }));

    expect(created[0]?.code).toBe('SALE10');
  });

  it('BLOCKS a tenant-funded discount that would drive the tenant share negative', async () => {
    // §12.4: the tenant would be paying the partner more than it collects.
    const { useCase, created } = harness();

    await expect(
      useCase.execute(TENANT_ID, input({ discountType: 'percent', discountValue: '90' })),
    ).rejects.toBeInstanceOf(PromoTenantShareNegative);
    expect(created).toEqual([]);
  });

  it('does NOT apply the tenant-share guard to a partner-funded promo', async () => {
    // It comes out of the partner's own revenue.
    const { useCase, created } = harness();

    await useCase.execute(
      TENANT_ID,
      input({
        fundedBy: 'partner',
        discountValue: '90',
        appliesTo: 'partner',
        appliesToId: 'partner-1',
      }),
    );

    expect(created).toHaveLength(1);
  });

  it('no-ops the guard when the tenant has no default commission rule', async () => {
    const { useCase, created } = harness({ rules: [] });

    await useCase.execute(TENANT_ID, input({ discountValue: '90' }));

    expect(created).toHaveLength(1);
  });

  it('REFUSES a scope target of the wrong entity type', async () => {
    // A category uuid stored under a `listing` scope matches no listing, so the
    // promotion would silently apply to nothing.
    const { useCase, created } = harness({ scopeLabel: null });

    await expect(
      useCase.execute(TENANT_ID, input({ appliesTo: 'listing', appliesToId: 'cat-1' })),
    ).rejects.toBeInstanceOf(PromoScopeTargetInvalid);
    expect(created).toEqual([]);
  });

  it('refuses a narrow scope with no target at all', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, input({ appliesTo: 'listing' })),
    ).rejects.toBeInstanceOf(PromoScopeTargetMissing);
  });

  it('DISCARDS a target on the `all` scope, and checks nothing', async () => {
    const { useCase, created, scopeChecks } = harness();

    await useCase.execute(TENANT_ID, input({ appliesTo: 'all', appliesToId: 'listing-1' }));

    expect(scopeChecks).toEqual([]);
    expect(created[0]).toMatchObject({ appliesTo: 'all', appliesToId: null });
  });

  it('resolves the funding partner from a LISTING scope', async () => {
    // A partner-funded promo must name exactly one partner to bill.
    const { useCase, created } = harness({ listingPartnerId: 'partner-9' });

    await useCase.execute(
      TENANT_ID,
      input({ fundedBy: 'partner', appliesTo: 'listing', appliesToId: 'listing-1' }),
    );

    expect(created[0]).toMatchObject({ fundingPartnerId: 'partner-9' });
  });

  it('refuses a partner-funded promo whose scope names no partner', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(
        TENANT_ID,
        input({ fundedBy: 'partner', appliesTo: 'category', appliesToId: 'cat-1' }),
      ),
    ).rejects.toBeInstanceOf(PromoFundingPartnerUnresolved);
  });

  it('starts a partner-funded promo UN-OPTED-IN', async () => {
    // §12.2: the partner has not agreed to pay for it yet.
    const { useCase, created } = harness();

    await useCase.execute(
      TENANT_ID,
      input({ fundedBy: 'partner', appliesTo: 'partner', appliesToId: 'partner-1' }),
    );

    expect(created[0]).toMatchObject({ partnerOptInAt: null, fundingPartnerId: 'partner-1' });
  });

  it('leaves a tenant-funded promo with no funding partner', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(created[0]).toMatchObject({ fundingPartnerId: null, createdByPartnerId: null });
  });

  it('FORCES a code-less campaign off the storefront', async () => {
    // There is no code to show, so "visible" would render an empty voucher card.
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ code: null, storefrontVisible: true }));

    expect(created[0]).toMatchObject({ code: null, storefrontVisible: false });
  });

  it('keeps a coded promo visible when asked', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ storefrontVisible: true }));

    expect(created[0]).toMatchObject({ storefrontVisible: true });
  });

  it('treats an EMPTY time-window list as no restriction', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ timeWindows: [] }));

    expect(created[0]?.timeWindows).toBeNull();
  });

  it('parses the money fields as bigint and the dates as instants', async () => {
    const { useCase, created, tenantDb } = harness();

    await useCase.execute(
      TENANT_ID,
      input({
        discountType: 'fixed',
        discountValue: '50000',
        maxDiscount: '100000',
        minOrderAmount: '200000',
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-09-30T00:00:00.000Z',
      }),
    );

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      discountValue: 50_000n,
      maxDiscount: 100_000n,
      minOrderAmount: 200_000n,
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      endsAt: new Date('2026-09-30T00:00:00.000Z'),
    });
  });

  it('leaves the optional money fields null when omitted', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(created[0]).toMatchObject({
      maxDiscount: null,
      minOrderAmount: null,
      usageLimitTotal: null,
      usageLimitPerCustomer: null,
      startsAt: null,
      endsAt: null,
    });
  });
});
