import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  CommissionRuleRecord,
  ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { ListCommissionRulesUseCase } from './list-commission-rules.use-case';

const TENANT_ID = 'tenant-1';

describe('ListCommissionRulesUseCase', () => {
  it('lists the tenant rules inside one transaction', async () => {
    // Precedence is resolved in the domain from this whole set, so the read is
    // deliberately unfiltered — RLS is what keeps it to one tenant.
    const rows = [] as CommissionRuleRecord[];
    const tenantDb = fakeTenantDb();
    const useCase = new ListCommissionRulesUseCase(
      fakePort<ICommissionRuleRepository>({ list: () => Promise.resolve(rows) }),
      tenantDb.service,
    );

    await expect(useCase.execute(TENANT_ID)).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
