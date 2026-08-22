import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ILedgerRepository, OwnerBalance } from '../../domain/ports/ledger-repository.port';
import { GetTenantFinanceSummaryUseCase } from './get-tenant-finance-summary.use-case';

const TENANT_ID = 'tenant-1';

const balance = (ownerId: string | null, credit: bigint, debit: bigint): OwnerBalance =>
  ({ ownerType: 'partner', ownerId, credit, debit }) as OwnerBalance;

function harness(
  options: {
    partners?: OwnerBalance[];
    affiliates?: OwnerBalance[];
    platform?: [bigint, bigint];
    tenant?: [bigint, bigint];
  } = {},
) {
  const owners: Array<{ ownerType: string; ownerId: string | null }> = [];
  const tenantDb = fakeTenantDb();
  const useCase = new GetTenantFinanceSummaryUseCase(
    fakePort<ILedgerRepository>({
      balancesByType: (_tx, ownerType) =>
        Promise.resolve(
          ownerType === 'partner' ? (options.partners ?? []) : (options.affiliates ?? []),
        ),
      ownerBalance: (_tx, ownerType, ownerId) => {
        owners.push({ ownerType, ownerId });
        const [credit, debit] =
          ownerType === 'platform' ? (options.platform ?? [0n, 0n]) : (options.tenant ?? [0n, 0n]);
        return Promise.resolve({ ownerType, ownerId, credit, debit } as never);
      },
    }),
    tenantDb.service,
  );
  return { useCase, tenantDb, owners };
}

describe('GetTenantFinanceSummaryUseCase', () => {
  it('nets every balance as credit minus debit and totals the payables', async () => {
    const { useCase, tenantDb } = harness({
      partners: [balance('partner-1', 3_000_000n, 1_000_000n), balance('partner-2', 500_000n, 0n)],
      affiliates: [balance('affiliate-1', 200_000n, 50_000n)],
      platform: [400_000n, 100_000n],
      tenant: [10_000_000n, 2_000_000n],
    });

    await expect(useCase.execute(TENANT_ID)).resolves.toMatchObject({
      netRevenue: 8_000_000n,
      partnerPayable: 2_500_000n,
      affiliatePayable: 150_000n,
      platformFeePayable: 300_000n,
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('reads the platform account with a null owner and the tenant with its id', async () => {
    // The platform fee is one account for the whole installation; the tenant's own
    // revenue account is keyed by tenant id.
    const { useCase, owners } = harness();

    await useCase.execute(TENANT_ID);

    expect(owners).toEqual([
      { ownerType: 'platform', ownerId: null },
      { ownerType: 'tenant', ownerId: TENANT_ID },
    ]);
  });

  it('answers zeros for a tenant with no ledger activity', async () => {
    const { useCase } = harness();

    await expect(useCase.execute(TENANT_ID)).resolves.toEqual({
      netRevenue: 0n,
      partnerPayable: 0n,
      affiliatePayable: 0n,
      platformFeePayable: 0n,
      partnerBalances: [],
      affiliateBalances: [],
    });
  });
});
