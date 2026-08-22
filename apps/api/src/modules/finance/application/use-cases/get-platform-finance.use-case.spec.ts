import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { IPlatformFinanceReader } from '../../domain/ports/platform-finance-reader.port';
import { GetPlatformFinanceUseCase } from './get-platform-finance.use-case';

function harness(rows: Array<{ tenantId: string; feePayable: bigint }>) {
  return new GetPlatformFinanceUseCase(
    fakePort<IPlatformFinanceReader>({ listPlatformFees: () => Promise.resolve(rows) }),
  );
}

describe('GetPlatformFinanceUseCase', () => {
  it('totals the platform fee across every tenant', async () => {
    // Cross-tenant by design: the reader owns the BYPASSRLS query, so there is no
    // `forTenant` here at all.
    const rows = [
      { tenantId: 'tenant-1', feePayable: 1_500_000n },
      { tenantId: 'tenant-2', feePayable: 2_250_000n },
    ];

    await expect(harness(rows).execute()).resolves.toEqual({
      totalFeePayable: 3_750_000n,
      perTenant: rows,
    });
  });

  it('totals in bigint so a large VND figure cannot lose precision', async () => {
    const rows = [
      { tenantId: 'tenant-1', feePayable: 9_007_199_254_740_993n },
      { tenantId: 'tenant-2', feePayable: 1n },
    ];

    await expect(harness(rows).execute()).resolves.toMatchObject({
      totalFeePayable: 9_007_199_254_740_994n,
    });
  });

  it('answers zero for a platform with no fees yet', async () => {
    await expect(harness([]).execute()).resolves.toEqual({ totalFeePayable: 0n, perTenant: [] });
  });
});
