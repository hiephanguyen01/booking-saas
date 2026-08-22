import { describe, expect, it } from 'vitest';
import { fakePort, fakeTx } from '~testing';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  PartnerTaxStatus,
  TaxCategory,
  TaxRateCandidate,
} from '../../../../shared/domain/tax/tax';
import type { ITaxRateRepository } from '../../domain/ports/tax-rate-repository.port';
import { ResolveTaxUseCase } from './resolve-tax.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const LISTING_TYPE_ID = 'listing-type-1';

/**
 * The real Vietnamese schedule shape that matters here: the 8% relief on standard
 * services runs out at the end of 2026 and 10% resumes. Every "which date decides"
 * assertion below straddles that boundary.
 */
const SCHEDULE: TaxRateCandidate[] = [
  {
    id: 'rate-standard-8',
    category: 'standard',
    rateBps: 800,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: new Date('2027-01-01T00:00:00Z'),
    legalRef: 'NQ 174/2024/QH15',
  },
  {
    id: 'rate-standard-10',
    category: 'standard',
    rateBps: 1000,
    effectiveFrom: new Date('2027-01-01T00:00:00Z'),
    effectiveTo: null,
    legalRef: 'Luật thuế GTGT',
  },
  {
    id: 'rate-percentage-service-5',
    category: 'percentage_service',
    rateBps: 500,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    legalRef: 'TT 40/2021/TT-BTC',
  },
];

interface Stubs {
  partner?: { isHouse: boolean; taxStatus: PartnerTaxStatus } | null;
  tenantStatus?: PartnerTaxStatus | null;
  listingTypeCategory?: TaxCategory | null;
  schedule?: TaxRateCandidate[];
}

interface Harness {
  readonly useCase: ResolveTaxUseCase;
  readonly tx: PrismaTx;
  /** Which models the use case actually read — proves the queries it skipped. */
  readonly reads: string[];
}

function harness(stubs: Stubs = {}): Harness {
  const reads: string[] = [];
  const tx = fakeTx({
    partner: {
      findUnique: () => {
        reads.push('partner');
        return Promise.resolve(
          stubs.partner === undefined
            ? { isHouse: false, taxStatus: 'company_vat' }
            : stubs.partner,
        );
      },
    },
    tenant: {
      findUnique: () => {
        reads.push('tenant');
        return Promise.resolve(
          stubs.tenantStatus === undefined
            ? { taxStatus: 'company_vat' }
            : stubs.tenantStatus === null
              ? null
              : { taxStatus: stubs.tenantStatus },
        );
      },
    },
    listingType: {
      findUnique: () => {
        reads.push('listingType');
        return Promise.resolve(
          stubs.listingTypeCategory === undefined
            ? { taxCategory: 'standard' }
            : stubs.listingTypeCategory === null
              ? null
              : { taxCategory: stubs.listingTypeCategory },
        );
      },
    },
  });
  const taxRates = fakePort<ITaxRateRepository>({
    list: () => Promise.resolve(stubs.schedule ?? SCHEDULE),
  });
  return { useCase: new ResolveTaxUseCase(taxRates), tx, reads };
}

const target = (overrides: Partial<Parameters<ResolveTaxUseCase['execute']>[1]> = {}) => ({
  tenantId: TENANT_ID,
  partnerId: PARTNER_ID,
  listingTypeId: LISTING_TYPE_ID,
  serviceDate: new Date('2026-09-01T03:00:00Z'),
  ...overrides,
});

describe('ResolveTaxUseCase', () => {
  it('charges nothing, and reads nothing, when there is no listing type', async () => {
    const { useCase, tx, reads } = harness();

    const snapshot = await useCase.execute(tx, target({ listingTypeId: null }));

    expect(snapshot.vatBps).toBe(0);
    expect(snapshot.taxRateId).toBeNull();
    expect(reads).toEqual([]);
  });

  it('charges nothing when the partner row is missing', async () => {
    const { useCase, tx } = harness({ partner: null });

    expect((await useCase.execute(tx, target())).vatBps).toBe(0);
  });

  it('reads the TENANT tax status for house inventory, not the partner row', async () => {
    // House inventory is sold by the tenant, so an exempt tenant selling through a
    // VAT-registered house partner must still charge nothing.
    const { useCase, tx, reads } = harness({
      partner: { isHouse: true, taxStatus: 'company_vat' },
      tenantStatus: 'household_below_threshold',
    });

    expect((await useCase.execute(tx, target())).vatBps).toBe(0);
    expect(reads).toEqual(['partner', 'tenant']);
  });

  it('reads the partner tax status for partner inventory', async () => {
    const { useCase, tx, reads } = harness({
      partner: { isHouse: false, taxStatus: 'company_vat' },
    });

    expect((await useCase.execute(tx, target())).vatBps).toBe(800);
    expect(reads).not.toContain('tenant');
  });

  it.each<PartnerTaxStatus>(['household_below_threshold', 'individual'])(
    'charges nothing for a %s seller whatever the listing type',
    async (taxStatus) => {
      const { useCase, tx } = harness({ partner: { isHouse: false, taxStatus } });

      const snapshot = await useCase.execute(tx, target());

      expect(snapshot.vatBps).toBe(0);
      expect(snapshot.category).toBeNull();
    },
  );

  it('puts a declaring household on the percentage regime without reading the catalogue', async () => {
    // The bug this pins: treating a declaring household as an 8% enterprise. It is
    // 5% on the percentage method, and its rate follows the seller's regime, so
    // the listing type's classification is never consulted.
    const { useCase, tx, reads } = harness({
      partner: { isHouse: false, taxStatus: 'household_declaring' },
    });

    const snapshot = await useCase.execute(tx, target());

    expect(snapshot).toMatchObject({
      method: 'percentage',
      category: 'percentage_service',
      vatBps: 500,
      taxRateId: 'rate-percentage-service-5',
    });
    expect(reads).not.toContain('listingType');
  });

  it('reads the listing type classification for a deduction-method seller', async () => {
    const { useCase, tx, reads } = harness({
      partner: { isHouse: false, taxStatus: 'company_vat' },
      listingTypeCategory: 'standard',
    });

    const snapshot = await useCase.execute(tx, target());

    expect(snapshot).toMatchObject({ method: 'deduction', category: 'standard', vatBps: 800 });
    expect(reads).toContain('listingType');
  });

  it('charges nothing when the listing type row is missing', async () => {
    const { useCase, tx } = harness({ listingTypeCategory: null });

    expect((await useCase.execute(tx, target())).vatBps).toBe(0);
  });

  it('charges nothing when the schedule has no row for the category', async () => {
    const { useCase, tx } = harness({ listingTypeCategory: 'exempt' });

    expect((await useCase.execute(tx, target())).vatBps).toBe(0);
  });

  it('picks the rate in force on the SERVICE date, not the booking date', async () => {
    // The whole reason the argument is called serviceDate: a December 2026 booking
    // for a January 2027 session is a 10% booking.
    const { useCase, tx } = harness();

    const snapshot = await useCase.execute(
      tx,
      target({ serviceDate: new Date('2027-01-15T03:00:00Z') }),
    );

    expect(snapshot).toMatchObject({ vatBps: 1000, taxRateId: 'rate-standard-10' });
  });

  it('treats effectiveTo as exclusive at the instant the relief lapses', async () => {
    const { useCase, tx } = harness();

    expect(
      await useCase.execute(tx, target({ serviceDate: new Date('2026-12-31T23:59:59Z') })),
    ).toMatchObject({ vatBps: 800 });
    expect(
      await useCase.execute(tx, target({ serviceDate: new Date('2027-01-01T00:00:00Z') })),
    ).toMatchObject({ vatBps: 1000 });
  });

  it('stamps resolvedFor with the service date so the snapshot can be replayed', async () => {
    const { useCase, tx } = harness();
    const serviceDate = new Date('2027-01-15T03:00:00Z');

    expect((await useCase.execute(tx, target({ serviceDate }))).resolvedFor).toBe(
      serviceDate.toISOString(),
    );
  });
});
