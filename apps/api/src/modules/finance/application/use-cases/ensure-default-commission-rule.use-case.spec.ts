import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  CommissionRuleRecord,
  CreateCommissionRuleData,
  ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { EnsureDefaultCommissionRuleUseCase } from './ensure-default-commission-rule.use-case';

const TENANT_ID = 'tenant-1';

const rule = (appliesTo: string): CommissionRuleRecord =>
  ({ id: `rule-${appliesTo}`, tenantId: TENANT_ID, appliesTo }) as unknown as CommissionRuleRecord;

function harness(existing: CommissionRuleRecord[]) {
  const created: CreateCommissionRuleData[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new EnsureDefaultCommissionRuleUseCase(
      fakePort<ICommissionRuleRepository>({
        list: () => Promise.resolve(existing),
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

describe('EnsureDefaultCommissionRuleUseCase', () => {
  it('provisions the baseline rule for a brand-new tenant', async () => {
    // 15% tenant / 2% platform / 0% affiliate. Never 0% tenant: a booking that
    // resolves no rule pays the partner everything.
    const { useCase, tenantDb, created } = harness([]);

    await useCase.execute(TENANT_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      appliesTo: 'tenant_default',
      tenantRateType: 'percent',
      tenantRate: 15n,
      platformRate: 2,
      affiliateRate: 0n,
    });
  });

  it('is idempotent — `tenant.created` is delivered at least once', async () => {
    const existing = rule('tenant_default');
    const { useCase, created } = harness([existing]);

    await expect(useCase.execute(TENANT_ID)).resolves.toBe(existing);
    expect(created).toEqual([]);
  });

  it('still provisions when the tenant has overrides but no default', async () => {
    // An override alone cannot answer a booking on a listing it does not match.
    const { useCase, created } = harness([rule('partner'), rule('listing_type')]);

    await useCase.execute(TENANT_ID);

    expect(created).toHaveLength(1);
  });
});
