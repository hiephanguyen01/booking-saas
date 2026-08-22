import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  ISettlementRepository,
  SettlementSummary,
} from '../../domain/ports/settlement-repository.port';
import { GetSettlementSummaryUseCase } from './get-settlement-summary.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const asked: Array<string | undefined> = [];
  const summary = {} as SettlementSummary;
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetSettlementSummaryUseCase(
      fakePort<ISettlementRepository>({
        summarize: (_tx, partnerId) => {
          asked.push(partnerId);
          return Promise.resolve(summary);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    asked,
    summary,
  };
}

describe('GetSettlementSummaryUseCase', () => {
  it('summarises the whole tenant when no partner is named', async () => {
    const { useCase, tenantDb, asked, summary } = harness();

    await expect(useCase.execute(TENANT_ID)).resolves.toBe(summary);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(asked).toEqual([undefined]);
  });

  it('narrows to one partner when asked', async () => {
    // The partner dashboard and the tenant dashboard share this reader, so the
    // filter is the only thing separating a partner's money from the tenant's view.
    const { useCase, asked } = harness();

    await useCase.execute(TENANT_ID, 'partner-1');

    expect(asked).toEqual(['partner-1']);
  });
});
