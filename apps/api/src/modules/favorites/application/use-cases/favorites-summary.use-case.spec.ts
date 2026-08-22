import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  FavoriteSummaryRecord,
  IFavoriteReader,
} from '../../domain/ports/favorite-reader.port';
import { FavoritesSummaryUseCase } from './favorites-summary.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

function harness() {
  const calls: Array<string | undefined> = [];
  const summary = { total: 0, topTargets: [] } as unknown as FavoriteSummaryRecord;
  const tenantDb = fakeTenantDb();
  return {
    useCase: new FavoritesSummaryUseCase(
      fakePort<IFavoriteReader>({
        summary: (_tx, partnerId) => {
          calls.push(partnerId);
          return Promise.resolve(summary);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
    summary,
  };
}

describe('FavoritesSummaryUseCase', () => {
  it('summarises the whole tenant when no partner is named', async () => {
    const { useCase, tenantDb, calls, summary } = harness();

    await expect(useCase.execute(TENANT_ID)).resolves.toBe(summary);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([undefined]);
  });

  it('narrows the KPI to one partner when asked', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(calls).toEqual([PARTNER_ID]);
  });
});
