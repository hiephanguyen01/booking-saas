import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ILedgerRepository, LedgerEntryView } from '../../domain/ports/ledger-repository.port';
import { GetPartnerFinanceUseCase } from './get-partner-finance.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

function harness(credit: bigint, debit: bigint) {
  const calls: Array<{ ownerType: string; ownerId: string | null; limit?: number }> = [];
  const entries = [] as LedgerEntryView[];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetPartnerFinanceUseCase(
      fakePort<ILedgerRepository>({
        ownerBalance: (_tx, ownerType, ownerId) => {
          calls.push({ ownerType, ownerId });
          return Promise.resolve({ ownerType, ownerId, credit, debit } as never);
        },
        entriesForOwner: (_tx, ownerType, ownerId, limit) => {
          calls.push({ ownerType, ownerId, limit });
          return Promise.resolve(entries);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
    entries,
  };
}

describe('GetPartnerFinanceUseCase', () => {
  it('reports the balance as credit minus debit', async () => {
    // The partner's payable is what the tenant owes them: credits are earnings,
    // debits are payouts already made.
    const { useCase, tenantDb, entries } = harness(5_000_000n, 3_000_000n);

    await expect(useCase.execute(TENANT_ID, PARTNER_ID)).resolves.toEqual({
      balance: 2_000_000n,
      entries,
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('can go negative after a clawback', async () => {
    // §13.1 allows it explicitly — the shortfall is recovered from the next payout.
    const { useCase } = harness(1_000_000n, 1_500_000n);

    await expect(useCase.execute(TENANT_ID, PARTNER_ID)).resolves.toMatchObject({
      balance: -500_000n,
    });
  });

  it('reads both sides against the partner owner, capped at 100 entries', async () => {
    const { useCase, calls } = harness(0n, 0n);

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(calls).toEqual([
      { ownerType: 'partner', ownerId: PARTNER_ID },
      { ownerType: 'partner', ownerId: PARTNER_ID, limit: 100 },
    ]);
  });
});
