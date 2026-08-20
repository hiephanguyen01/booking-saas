import { describe, expect, it } from 'vitest';
import type { QuoteQuery } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTaxUseCase } from '../../../finance/application/use-cases/resolve-tax.use-case';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { ListingNotFound } from '../../domain/errors/listing-errors';
import { ModeNotEnabled } from '../../domain/errors/pricing-rule-errors';
import type {
  IListingRepository,
  PublicListingRecord,
} from '../../domain/ports/listing-repository.port';
import type { IPricingRuleRepository } from '../../domain/ports/pricing-rule-repository.port';
import { GetPublicQuoteUseCase } from './get-public-quote.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const SLUG = 'studio-a';
const FROM = '2026-09-10T02:00:00.000Z';
const TO = '2026-09-10T06:00:00.000Z';

/** 4 hours × 70,000 ₫ = 280,000 ₫ — the figure the VAT comment uses. */
const listing = (overrides: Record<string, unknown> = {}): PublicListingRecord =>
  ({
    id: 'listing-1',
    tenantId: TENANT_ID,
    partnerId: 'partner-1',
    listingTypeId: 'type-1',
    slug: SLUG,
    bookingModes: ['hourly'],
    bookingSelection: 'flexible_duration',
    modeConfig: { hourly: { basePrice: '70000', granularity: 60, leadTimeMin: 0 } },
    resourceTimezone: 'Asia/Ho_Chi_Minh',
    depositPercent: 100,
    ...overrides,
  }) as unknown as PublicListingRecord;

interface Options {
  record?: PublicListingRecord | null;
  vatBps?: number;
  method?: 'deduction' | 'percentage';
}

function harness(options: Options = {}) {
  const taxTargets: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetPublicQuoteUseCase(
      fakePort<IListingRepository>({
        findPublicBySlug: () =>
          Promise.resolve(options.record === undefined ? listing() : options.record),
      }),
      fakePort<IPricingRuleRepository>({ listByListing: () => Promise.resolve([]) }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
      }),
      fakeCollaborator<ResolveTaxUseCase>({
        execute: (_tx: unknown, target: unknown) => {
          taxTargets.push(target);
          return Promise.resolve({
            taxRateId: 'rate-1',
            category: 'standard',
            vatBps: options.vatBps ?? 0,
            method: options.method ?? 'deduction',
            legalRef: null,
            resolvedFor: FROM,
          });
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    taxTargets,
  };
}

const query = (overrides: Record<string, unknown> = {}) =>
  ({ mode: 'hourly', from: FROM, to: TO, quantity: 1, ...overrides }) as unknown as QuoteQuery;

describe('GetPublicQuoteUseCase', () => {
  it('answers 404 for a slug that is not published on this host', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(HOST, SLUG, query())).rejects.toBeInstanceOf(ListingNotFound);
  });

  it('refuses a mode the listing does not offer', async () => {
    const { useCase } = harness();

    await expect(useCase.execute(HOST, SLUG, query({ mode: 'daily' }))).rejects.toBeInstanceOf(
      ModeNotEnabled,
    );
  });

  it('resolves VAT for the SERVICE date, through the resolver a booking freezes', async () => {
    // The rate a customer is quoted can never disagree with the one they are
    // charged, so this must not be a second implementation — and it is dated by
    // the service instant, not by today.
    const { useCase, tenantDb, taxTargets } = harness();

    await useCase.execute(HOST, SLUG, query());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(taxTargets).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: 'partner-1',
        listingTypeId: 'type-1',
        serviceDate: new Date(FROM),
      },
    ]);
  });

  it('extracts VAT from the gross for a DEDUCTION seller', async () => {
    // 280,000 × 4/104 = 10,769 — the tax is already inside the price.
    const { useCase } = harness({ vatBps: 400, method: 'deduction' });

    await expect(useCase.execute(HOST, SLUG, query())).resolves.toMatchObject({
      subtotal: '280000',
      vatBps: 400,
      vatAmount: '10769',
    });
  });

  it('applies the rate to revenue for a PERCENTAGE seller', async () => {
    // 280,000 × 4% = 11,200. Using the deduction formula here quotes 10,769 and
    // the customer is later charged 11,200.
    const { useCase } = harness({ vatBps: 400, method: 'percentage' });

    await expect(useCase.execute(HOST, SLUG, query())).resolves.toMatchObject({
      vatAmount: '11200',
    });
  });

  it('quotes no VAT for an exempt seller', async () => {
    const { useCase } = harness({ vatBps: 0 });

    await expect(useCase.execute(HOST, SLUG, query())).resolves.toMatchObject({
      vatBps: 0,
      vatAmount: '0',
    });
  });
});
