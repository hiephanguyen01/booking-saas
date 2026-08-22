import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { TaxSnapshot } from '../../../../shared/domain/tax/tax';
import type { WithholdingSnapshot } from '../../../../shared/domain/tax/withholding';
import type {
  CommissionRuleRecord,
  ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import {
  ResolveCommissionUseCase,
  type ResolveCommissionTarget,
} from './resolve-commission.use-case';
import type { ResolveTaxUseCase } from './resolve-tax.use-case';
import type { ResolveWithholdingUseCase } from './resolve-withholding.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const LISTING_TYPE_ID = 'listing-type-1';
const CATEGORY_ID = 'category-1';

/** The Postgres clock, which is what decides whether a rule is in effect. */
const DB_NOW = new Date('2026-08-19T10:00:00Z');
/** A session five months out — deliberately in a different rule window from DB_NOW. */
const SERVICE_DATE = new Date('2027-01-15T03:00:00Z');

const TAX: TaxSnapshot = {
  taxRateId: 'rate-standard-10',
  category: 'standard',
  vatBps: 1000,
  method: 'deduction',
  legalRef: 'Luật thuế GTGT',
  resolvedFor: SERVICE_DATE.toISOString(),
};
const WITHHOLDING: WithholdingSnapshot = {
  rateId: 'wh-service-2027',
  activity: 'service',
  vatBps: 500,
  pitBps: 150,
  legalRef: 'NĐ 117/2025',
  resolvedFor: SERVICE_DATE.toISOString(),
};

function rule(overrides: Partial<CommissionRuleRecord> = {}): CommissionRuleRecord {
  return {
    id: 'rule-default',
    tenantId: TENANT_ID,
    appliesTo: 'tenant_default',
    listingTypeId: null,
    categoryId: null,
    partnerId: null,
    tenantRateType: 'percent',
    tenantRate: 10n,
    platformRate: 3,
    affiliateRateType: 'percent',
    affiliateRate: 2n,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

interface Harness {
  readonly useCase: ResolveCommissionUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  /** Arguments each collaborator was called with — the forwarding contract. */
  readonly taxCalls: unknown[];
  readonly withholdingCalls: unknown[];
}

function harness(rules: CommissionRuleRecord[], now: Date = DB_NOW): Harness {
  const tenantDb = fakeTenantDb({ now });
  const taxCalls: unknown[] = [];
  const withholdingCalls: unknown[] = [];

  const repository = fakePort<ICommissionRuleRepository>({ list: () => Promise.resolve(rules) });
  const tax = fakeCollaborator<ResolveTaxUseCase>({
    execute: (_tx: unknown, target: unknown) => {
      taxCalls.push(target);
      return Promise.resolve(TAX);
    },
  });
  const withholding = fakeCollaborator<ResolveWithholdingUseCase>({
    execute: (_tx: unknown, target: unknown) => {
      withholdingCalls.push(target);
      return Promise.resolve(WITHHOLDING);
    },
  });

  return {
    useCase: new ResolveCommissionUseCase(repository, tax, withholding, tenantDb.service),
    tenantDb,
    taxCalls,
    withholdingCalls,
  };
}

const target = (overrides: Partial<ResolveCommissionTarget> = {}): ResolveCommissionTarget => ({
  tenantId: TENANT_ID,
  partnerId: PARTNER_ID,
  listingTypeId: LISTING_TYPE_ID,
  categoryId: CATEGORY_ID,
  isHouse: false,
  serviceDate: SERVICE_DATE,
  ...overrides,
});

describe('ResolveCommissionUseCase', () => {
  it('freezes the matching rule into the snapshot, money as strings', async () => {
    const { useCase, tenantDb } = harness([rule({ tenantRate: 12n, affiliateRate: 3n })]);

    const snapshot = await useCase.execute(tenantDb.tx, target());

    // The snapshot is JSON in a column, so bigint rates must round-trip as
    // strings; `snapshotToRates` parses them back with BigInt().
    expect(snapshot).toMatchObject({
      ruleId: 'rule-default',
      appliesTo: 'tenant_default',
      tenantRateType: 'percent',
      tenantRate: '12',
      platformRate: 3,
      affiliateRateType: 'percent',
      affiliateRate: '3',
      isHouse: false,
    });
  });

  it('decides rule effectiveness on the DATABASE clock, not the service date', async () => {
    // This is the one that matters. Rule windows are evaluated at `databaseNow`;
    // VAT and withholding are evaluated at the service date. Resolving the rule
    // against the service date would pick `rule-2027` for a booking made today —
    // charging a commission that is not yet in force.
    const { useCase, tenantDb } = harness([
      rule({
        id: 'rule-2026',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: new Date('2027-01-01T00:00:00Z'),
      }),
      rule({ id: 'rule-2027', effectiveFrom: new Date('2027-01-01T00:00:00Z'), effectiveTo: null }),
    ]);

    const snapshot = await useCase.execute(tenantDb.tx, target());

    expect(snapshot.ruleId).toBe('rule-2026');
  });

  it('resolves VAT and withholding for the service date, not the database clock', async () => {
    const { useCase, tenantDb, taxCalls, withholdingCalls } = harness([rule()]);

    await useCase.execute(tenantDb.tx, target());

    expect(taxCalls).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        listingTypeId: LISTING_TYPE_ID,
        serviceDate: SERVICE_DATE,
      },
    ]);
    expect(withholdingCalls).toEqual([{ partnerId: PARTNER_ID, serviceDate: SERVICE_DATE }]);
  });

  it('prefers the partner rule over the tenant default', async () => {
    const { useCase, tenantDb } = harness([
      rule(),
      rule({ id: 'rule-partner', appliesTo: 'partner', partnerId: PARTNER_ID }),
    ]);

    expect((await useCase.execute(tenantDb.tx, target())).ruleId).toBe('rule-partner');
  });

  it('ignores a partner rule belonging to another partner', async () => {
    const { useCase, tenantDb } = harness([
      rule(),
      rule({ id: 'rule-other', appliesTo: 'partner', partnerId: 'partner-2' }),
    ]);

    expect((await useCase.execute(tenantDb.tx, target())).ruleId).toBe('rule-default');
  });

  it('falls back to a zero-commission snapshot when nothing matches', async () => {
    const { useCase, tenantDb } = harness([]);

    const snapshot = await useCase.execute(tenantDb.tx, target({ isHouse: true }));

    // Zero commission, not a thrown error: the partner keeps everything rather
    // than the booking failing on a tenant that has configured no rule yet.
    expect(snapshot).toMatchObject({
      ruleId: null,
      appliesTo: 'none',
      tenantRate: '0',
      platformRate: 0,
      affiliateRate: '0',
      isHouse: true,
    });
  });

  it('still attaches the resolved VAT and withholding to the fallback snapshot', async () => {
    // The fallback means "no commission rule", never "no tax". Dropping these
    // would make an unconfigured tenant silently issue 0% VAT bookings.
    const { useCase, tenantDb } = harness([]);

    const snapshot = await useCase.execute(tenantDb.tx, target());

    expect(snapshot.tax).toEqual(TAX);
    expect(snapshot.withholding).toEqual(WITHHOLDING);
  });

  it('attaches the resolved VAT and withholding to a matched snapshot', async () => {
    const { useCase, tenantDb } = harness([rule()]);

    const snapshot = await useCase.execute(tenantDb.tx, target());

    expect(snapshot.tax).toEqual(TAX);
    expect(snapshot.withholding).toEqual(WITHHOLDING);
  });

  it('runs on the caller transaction and opens none of its own', async () => {
    // The booking module calls this INSIDE its own forTenant, so the snapshot
    // commits atomically with the booking. Opening a second transaction here
    // would break that atomicity.
    const { useCase, tenantDb } = harness([rule()]);

    await useCase.execute(tenantDb.tx, target());

    expect(tenantDb.openedFor).toEqual([]);
  });
});
