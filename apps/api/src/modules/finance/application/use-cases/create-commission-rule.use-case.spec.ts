import { describe, expect, it } from 'vitest';
import type { CreateCommissionRuleInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import {
  CommissionExceedsPartnerDeposit,
  CommissionRatesNegativeTenant,
} from '../../domain/errors/finance-domain-errors';
import type {
  CommissionRuleRecord,
  CreateCommissionRuleData,
  ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { CreateCommissionRuleUseCase } from './create-commission-rule.use-case';

const TENANT_ID = 'tenant-1';
const HOUSE_PARTNER_ID = 'partner-house';
const OUTSIDE_PARTNER_ID = 'partner-outside';

const defaultRule = (platformRate: number): CommissionRuleRecord =>
  ({
    id: 'rule-default',
    tenantId: TENANT_ID,
    appliesTo: 'tenant_default',
    platformRate,
    tenantRateType: 'percent',
    tenantRate: 15n,
    affiliateRateType: 'percent',
    affiliateRate: 0n,
  }) as unknown as CommissionRuleRecord;

function harness(existing: CommissionRuleRecord[], incompatibleCount = 0) {
  const created: CreateCommissionRuleData[] = [];
  const tx = fakeTx({
    partner: {
      findFirst: (args: { where: { id: string } }) =>
        Promise.resolve({ isHouse: args.where.id === HOUSE_PARTNER_ID }),
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new CreateCommissionRuleUseCase(
      fakePort<ICommissionRuleRepository>({
        list: () => Promise.resolve(existing),
        findIncompatibleListingsForRule: () =>
          Promise.resolve({ count: incompatibleCount, samples: [] }),
        create: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve({ id: 'rule-new', ...data } as unknown as CommissionRuleRecord);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    created,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    appliesTo: 'listing_type',
    listingTypeId: 'type-1',
    tenantRateType: 'percent',
    tenantRate: '12',
    affiliateRateType: 'percent',
    affiliateRate: '3',
    ...overrides,
  }) as CreateCommissionRuleInput;

describe('CreateCommissionRuleUseCase', () => {
  it('inherits the platform fee from the tenant default rather than defaulting to zero', async () => {
    // The platform fee is platform-admin-owned (§7.7). A new override silently
    // starting at 0% would stop billing the platform for everything it matches.
    const { useCase, tenantDb, created } = harness([defaultRule(5)]);

    await useCase.execute(TENANT_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({ platformRate: 5 });
  });

  it('falls back to the platform baseline when the tenant has no default yet', async () => {
    const { useCase, created } = harness([]);

    await useCase.execute(TENANT_ID, input());

    expect(created[0]).toMatchObject({ platformRate: 2 });
  });

  it('parses the rates as bigint đồng/percent, and the dates as Dates', async () => {
    const { useCase, created } = harness([defaultRule(2)]);

    await useCase.execute(
      TENANT_ID,
      input({ effectiveFrom: '2027-01-01T00:00:00.000Z', effectiveTo: null }),
    );

    expect(created[0]).toMatchObject({
      tenantRate: 12n,
      affiliateRate: 3n,
      effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
      effectiveTo: null,
    });
  });

  it('refuses rates that leave the tenant share negative', async () => {
    // platform 5 + affiliate 12 > tenant 10.
    const { useCase, created } = harness([defaultRule(5)]);

    await expect(
      useCase.execute(TENANT_ID, input({ tenantRate: '10', affiliateRate: '12' })),
    ).rejects.toBeInstanceOf(CommissionRatesNegativeTenant);
    expect(created).toEqual([]);
  });

  it('waives the floor for a house partner', async () => {
    const { useCase, created } = harness([defaultRule(5)]);

    await useCase.execute(
      TENANT_ID,
      input({
        appliesTo: 'partner',
        partnerId: HOUSE_PARTNER_ID,
        listingTypeId: null,
        tenantRate: '1',
        affiliateRate: '12',
      }),
    );

    expect(created).toHaveLength(1);
  });

  it('still enforces the floor for an outside partner', async () => {
    const { useCase } = harness([defaultRule(5)]);

    await expect(
      useCase.execute(
        TENANT_ID,
        input({
          appliesTo: 'partner',
          partnerId: OUTSIDE_PARTNER_ID,
          listingTypeId: null,
          tenantRate: '1',
          affiliateRate: '12',
        }),
      ),
    ).rejects.toBeInstanceOf(CommissionRatesNegativeTenant);
  });

  it('refuses a rule whose commission would exceed an existing deposit', async () => {
    // A listing's deposit has to cover the tenant commission, or the tenant ends
    // up owing money it never collected.
    const { useCase, created } = harness([defaultRule(2)], 3);

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(
      CommissionExceedsPartnerDeposit,
    );
    expect(created).toEqual([]);
  });
});
