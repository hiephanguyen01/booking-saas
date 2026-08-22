import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  PromotionAlreadyOptedIn,
  PromotionNotFound,
  PromotionNotFundedByPartner,
} from '../../domain/errors/promotion-errors';
import type { IPromoAgreementRecorder } from '../../domain/ports/promo-agreement-recorder.port';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { OptInPromotionUseCase } from './opt-in-promotion.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const PROMO_ID = 'promo-1';
const ACTOR = { userId: 'user-1', ip: '203.0.113.9' };

const promotion = (overrides: Record<string, unknown> = {}): PromotionRecord =>
  ({
    id: PROMO_ID,
    fundedBy: 'partner',
    fundingPartnerId: PARTNER_ID,
    partnerOptInAt: null,
    ...overrides,
  }) as unknown as PromotionRecord;

function harness(found: PromotionRecord | null = promotion()) {
  const optIns: Array<{ id: string; at: Date }> = [];
  const agreements: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new OptInPromotionUseCase(
      fakePort<IPromotionRepository>({
        findById: () => Promise.resolve(found),
        setPartnerOptIn: (_tx, id, at) => {
          optIns.push({ id, at });
          return Promise.resolve(promotion({ partnerOptInAt: at }));
        },
      }),
      fakePort<IPromoAgreementRecorder>({
        record: (_tx, entry) => {
          agreements.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    optIns,
    agreements,
  };
}

describe('OptInPromotionUseCase', () => {
  it('answers not-found for an unknown promotion', async () => {
    const { useCase, optIns } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, ACTOR),
    ).rejects.toBeInstanceOf(PromotionNotFound);
    expect(optIns).toEqual([]);
  });

  it('refuses a TENANT-funded promotion — there is nothing to consent to', async () => {
    const { useCase, optIns } = harness(promotion({ fundedBy: 'tenant' }));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, ACTOR),
    ).rejects.toBeInstanceOf(PromotionNotFundedByPartner);
    expect(optIns).toEqual([]);
  });

  it("refuses when ANOTHER partner is the one funding it", async () => {
    // Otherwise a partner could commit a competitor's revenue to a discount.
    const { useCase, optIns } = harness(promotion({ fundingPartnerId: 'partner-2' }));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, ACTOR),
    ).rejects.toBeInstanceOf(PromotionNotFundedByPartner);
    expect(optIns).toEqual([]);
  });

  it('refuses a second opt-in', async () => {
    // The consent is recorded once; a repeat would add a duplicate agreement row
    // and move the opt-in timestamp.
    const { useCase, optIns } = harness(promotion({ partnerOptInAt: new Date() }));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, ACTOR),
    ).rejects.toBeInstanceOf(PromotionAlreadyOptedIn);
    expect(optIns).toEqual([]);
  });

  it('stamps the opt-in and RECORDS the agreement in the same transaction', async () => {
    // The partner is agreeing to fund a discount; the consent must not survive a
    // rolled-back opt-in, nor be lost by one that committed.
    const { useCase, optIns, agreements, tenantDb } = harness();
    const before = Date.now();

    await useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, ACTOR);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(optIns[0]?.id).toBe(PROMO_ID);
    expect(optIns[0]?.at.getTime()).toBeGreaterThanOrEqual(before);
    expect(agreements).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        userId: 'user-1',
        promotionId: PROMO_ID,
        ip: '203.0.113.9',
      },
    ]);
  });

  it('stores a null ip rather than undefined', async () => {
    const { useCase, agreements } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, PROMO_ID, { userId: 'user-1' });

    expect(agreements[0]).toMatchObject({ ip: null });
  });
});
