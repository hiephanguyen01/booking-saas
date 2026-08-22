import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { CommissionRatesNegativeTenant } from '../../domain/errors/finance-domain-errors';
import type {
  CommissionRuleRecord,
  ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { UpdateTenantPlatformRateUseCase } from './update-tenant-platform-rate.use-case';

const TENANT_ID = 'tenant-1';
const HOUSE_PARTNER_ID = 'partner-house';
const OUTSIDE_PARTNER_ID = 'partner-outside';

function rule(overrides: Partial<CommissionRuleRecord> = {}): CommissionRuleRecord {
  return {
    id: 'rule-default',
    tenantId: TENANT_ID,
    appliesTo: 'tenant_default',
    listingTypeId: null,
    categoryId: null,
    partnerId: null,
    // The floor is `platform% + affiliate% <= tenant%`, so 10/2 leaves room for a
    // platform fee of at most 8.
    tenantRateType: 'percent',
    tenantRate: 10n,
    platformRate: 2,
    affiliateRateType: 'percent',
    affiliateRate: 2n,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

interface Harness {
  readonly useCase: UpdateTenantPlatformRateUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  /** Platform rates actually written, in call order — empty means nothing changed. */
  readonly written: number[];
  /** Partner ids the house lookup was asked about. */
  readonly houseLookups: string[];
}

function harness(rules: CommissionRuleRecord[]): Harness {
  const written: number[] = [];
  const houseLookups: string[] = [];
  const tx = fakeTx({
    partner: {
      findFirst: (args: { where: { id: string } }) => {
        houseLookups.push(args.where.id);
        return Promise.resolve({ isHouse: args.where.id === HOUSE_PARTNER_ID });
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  const repository = fakePort<ICommissionRuleRepository>({
    list: () => Promise.resolve(rules),
    updatePlatformRateForTenant: (_tx, platformRate) => {
      written.push(platformRate);
      return Promise.resolve(rules.length);
    },
  });

  return {
    useCase: new UpdateTenantPlatformRateUseCase(repository, tenantDb.service),
    tenantDb,
    written,
    houseLookups,
  };
}

describe('UpdateTenantPlatformRateUseCase', () => {
  it('writes the rate across every rule of the tenant, in one transaction', async () => {
    // Not just tenant_default: an override copies the platform rate when created,
    // so leaving overrides behind keeps billing them the old fee.
    const { useCase, tenantDb, written } = harness([
      rule(),
      rule({ id: 'rule-type', appliesTo: 'listing_type', listingTypeId: 'lt-1' }),
    ]);

    await useCase.execute(TENANT_ID, { platformRate: 5 });

    expect(written).toEqual([5]);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('rejects the whole change when a single rule cannot carry the new fee', async () => {
    // All-or-nothing: a half-applied fee change is worse than a refused one. The
    // second rule leaves room for 3 at most, so 5 must take the first one down too.
    const { useCase, written } = harness([
      rule(),
      rule({ id: 'rule-tight', appliesTo: 'category', categoryId: 'cat-1', tenantRate: 5n }),
    ]);

    await expect(useCase.execute(TENANT_ID, { platformRate: 5 })).rejects.toBeInstanceOf(
      CommissionRatesNegativeTenant,
    );
    expect(written).toEqual([]);
  });

  it('accepts the rate that lands exactly on the floor', async () => {
    const { useCase, written } = harness([rule()]);

    await useCase.execute(TENANT_ID, { platformRate: 8 });

    expect(written).toEqual([8]);
  });

  it('waives the floor for a house-partner rule', async () => {
    // House inventory is the tenant's own, so there is no outside partner whose
    // share could go negative.
    const { useCase, written } = harness([
      rule({ id: 'rule-house', appliesTo: 'partner', partnerId: HOUSE_PARTNER_ID, tenantRate: 1n }),
    ]);

    await useCase.execute(TENANT_ID, { platformRate: 9 });

    expect(written).toEqual([9]);
  });

  it('still enforces the floor for an outside-partner rule', async () => {
    const { useCase, written } = harness([
      rule({
        id: 'rule-outside',
        appliesTo: 'partner',
        partnerId: OUTSIDE_PARTNER_ID,
        tenantRate: 1n,
      }),
    ]);

    await expect(useCase.execute(TENANT_ID, { platformRate: 9 })).rejects.toBeInstanceOf(
      CommissionRatesNegativeTenant,
    );
    expect(written).toEqual([]);
  });

  it('asks whether a partner is house-owned only for partner-scoped rules', async () => {
    const { useCase, houseLookups } = harness([
      rule(),
      rule({ id: 'rule-type', appliesTo: 'listing_type', listingTypeId: 'lt-1' }),
      rule({ id: 'rule-partner', appliesTo: 'partner', partnerId: OUTSIDE_PARTNER_ID }),
    ]);

    await useCase.execute(TENANT_ID, { platformRate: 3 });

    expect(houseLookups).toEqual([OUTSIDE_PARTNER_ID]);
  });

  it('returns the rules as they stand after the write', async () => {
    const { useCase } = harness([rule(), rule({ id: 'rule-type', appliesTo: 'listing_type' })]);

    const updated = await useCase.execute(TENANT_ID, { platformRate: 4 });

    expect(updated.map((entry) => entry.id)).toEqual(['rule-default', 'rule-type']);
  });
});
