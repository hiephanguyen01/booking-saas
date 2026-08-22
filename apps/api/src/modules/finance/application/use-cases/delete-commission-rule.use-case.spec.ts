import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  CommissionRuleNotFound,
  DefaultCommissionRuleLocked,
} from '../../domain/errors/finance-domain-errors';
import type {
  CommissionRuleRecord,
  ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { DeleteCommissionRuleUseCase } from './delete-commission-rule.use-case';

const TENANT_ID = 'tenant-1';
const RULE_ID = 'rule-1';

const rule = (appliesTo = 'partner'): CommissionRuleRecord =>
  ({ id: RULE_ID, tenantId: TENANT_ID, appliesTo }) as unknown as CommissionRuleRecord;

function harness(record: CommissionRuleRecord | null) {
  const deleted: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DeleteCommissionRuleUseCase(
      fakePort<ICommissionRuleRepository>({
        findById: () => Promise.resolve(record),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    deleted,
  };
}

describe('DeleteCommissionRuleUseCase', () => {
  it('answers 404 for a rule this tenant does not have', async () => {
    const { useCase, deleted } = harness(null);

    await expect(useCase.execute(TENANT_ID, RULE_ID)).rejects.toBeInstanceOf(
      CommissionRuleNotFound,
    );
    expect(deleted).toEqual([]);
  });

  it('refuses to delete the tenant default', async () => {
    // Every booking has to resolve a rate; without the default, a booking on a
    // listing with no override would fall back to zero commission silently.
    const { useCase, deleted } = harness(rule('tenant_default'));

    await expect(useCase.execute(TENANT_ID, RULE_ID)).rejects.toBeInstanceOf(
      DefaultCommissionRuleLocked,
    );
    expect(deleted).toEqual([]);
  });

  it.each(['partner', 'listing_type', 'category'])('deletes a %s override', async (appliesTo) => {
    const { useCase, tenantDb, deleted } = harness(rule(appliesTo));

    await useCase.execute(TENANT_ID, RULE_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([RULE_ID]);
  });
});
