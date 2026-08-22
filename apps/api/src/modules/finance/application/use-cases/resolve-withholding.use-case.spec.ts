import { describe, expect, it } from 'vitest';
import { fakePort, fakeTx } from '~testing';
import type { PartnerTaxStatus } from '../../../../shared/domain/tax/tax';
import type { WithholdingRateCandidate } from '../../../../shared/domain/tax/withholding';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { IWithholdingRateRepository } from '../../domain/ports/withholding-rate-repository.port';
import { ResolveWithholdingUseCase } from './resolve-withholding.use-case';

const PARTNER_ID = 'partner-1';
const SERVICE_DATE = new Date('2026-09-01T03:00:00Z');

const SCHEDULE: WithholdingRateCandidate[] = [
  {
    id: 'wh-service-2026',
    activity: 'service',
    vatBps: 500,
    pitBps: 200,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: new Date('2027-01-01T00:00:00Z'),
    legalRef: 'NĐ 117/2025',
  },
  {
    id: 'wh-service-2027',
    activity: 'service',
    vatBps: 500,
    pitBps: 150,
    effectiveFrom: new Date('2027-01-01T00:00:00Z'),
    effectiveTo: null,
    legalRef: 'NĐ 117/2025',
  },
  {
    // Present so a wrong activity filter is visible rather than silently harmless.
    id: 'wh-goods-2026',
    activity: 'goods',
    vatBps: 100,
    pitBps: 50,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    legalRef: 'NĐ 117/2025',
  },
];

interface Harness {
  readonly useCase: ResolveWithholdingUseCase;
  readonly tx: PrismaTx;
}

function harness(
  partner: { isHouse: boolean; taxStatus: PartnerTaxStatus } | null | undefined = {
    isHouse: false,
    taxStatus: 'household_declaring',
  },
  schedule: WithholdingRateCandidate[] = SCHEDULE,
): Harness {
  const tx = fakeTx({
    partner: { findUnique: () => Promise.resolve(partner ?? null) },
  });
  const withholdingRates = fakePort<IWithholdingRateRepository>({
    list: () => Promise.resolve(schedule),
  });
  return { useCase: new ResolveWithholdingUseCase(withholdingRates), tx };
}

describe('ResolveWithholdingUseCase', () => {
  it('withholds nothing when the partner row is missing', async () => {
    const { useCase, tx } = harness(null);

    expect(
      await useCase.execute(tx, { partnerId: PARTNER_ID, serviceDate: SERVICE_DATE }),
    ).toMatchObject({
      rateId: null,
      vatBps: 0,
      pitBps: 0,
    });
  });

  it('withholds nothing from house inventory — the tenant is the seller', async () => {
    const { useCase, tx } = harness({ isHouse: true, taxStatus: 'household_declaring' });

    expect(
      (await useCase.execute(tx, { partnerId: PARTNER_ID, serviceDate: SERVICE_DATE })).rateId,
    ).toBeNull();
  });

  it('withholds nothing from a company — it invoices and declares for itself', async () => {
    const { useCase, tx } = harness({ isHouse: false, taxStatus: 'company_vat' });

    expect(
      (await useCase.execute(tx, { partnerId: PARTNER_ID, serviceDate: SERVICE_DATE })).rateId,
    ).toBeNull();
  });

  it.each<PartnerTaxStatus>(['household_declaring', 'household_below_threshold', 'individual'])(
    'withholds from a %s seller',
    async (taxStatus) => {
      // A below-threshold seller is included on purpose: its 0% sale rate does not
      // exempt it from withholding at source, only makes the amount reclaimable at
      // annual settlement.
      const { useCase, tx } = harness({ isHouse: false, taxStatus });

      expect(
        await useCase.execute(tx, { partnerId: PARTNER_ID, serviceDate: SERVICE_DATE }),
      ).toMatchObject({
        rateId: 'wh-service-2026',
        activity: 'service',
        vatBps: 500,
        pitBps: 200,
      });
    },
  );

  it('reads the service activity, never another activity in the schedule', async () => {
    const { useCase, tx } = harness(
      undefined,
      SCHEDULE.filter((rate) => rate.activity === 'goods'),
    );

    expect(
      (await useCase.execute(tx, { partnerId: PARTNER_ID, serviceDate: SERVICE_DATE })).rateId,
    ).toBeNull();
  });

  it('picks the rate in force on the service date', async () => {
    const { useCase, tx } = harness();

    expect(
      await useCase.execute(tx, {
        partnerId: PARTNER_ID,
        serviceDate: new Date('2027-06-01T03:00:00Z'),
      }),
    ).toMatchObject({ rateId: 'wh-service-2027', pitBps: 150 });
  });

  it('withholds nothing when the service date precedes the whole schedule', async () => {
    const { useCase, tx } = harness();

    expect(
      (
        await useCase.execute(tx, {
          partnerId: PARTNER_ID,
          serviceDate: new Date('2025-06-01T03:00:00Z'),
        })
      ).rateId,
    ).toBeNull();
  });

  it('stamps resolvedFor with the service date, including on the empty snapshot', async () => {
    const { useCase, tx } = harness({ isHouse: false, taxStatus: 'company_vat' });

    expect(
      (await useCase.execute(tx, { partnerId: PARTNER_ID, serviceDate: SERVICE_DATE })).resolvedFor,
    ).toBe(SERVICE_DATE.toISOString());
  });
});
