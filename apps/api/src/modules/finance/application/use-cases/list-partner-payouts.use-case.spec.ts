import { describe, expect, it } from 'vitest';
import type { PaginationQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPayoutRepository } from '../../domain/ports/payout-repository.port';
import { ListPartnerPayoutsUseCase } from './list-partner-payouts.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

describe('ListPartnerPayoutsUseCase', () => {
  it('reads the payouts themselves, forced to the partner in scope', async () => {
    // Not reconstructed from ledger entries: a pending run (money promised, not
    // transferred) and a failed one write no ledger entry and would be invisible.
    const calls: Array<{ payeeType: string; payeeId: string; query: PaginationQuery }> = [];
    const page = { items: [], total: 0 };
    const tenantDb = fakeTenantDb();
    const useCase = new ListPartnerPayoutsUseCase(
      fakePort<IPayoutRepository>({
        listForPayee: (_tx, payeeType, payeeId, query) => {
          calls.push({ payeeType, payeeId, query });
          return Promise.resolve(page as never);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 1, pageSize: 20 } as PaginationQuery;
    await expect(useCase.execute(TENANT_ID, PARTNER_ID, query)).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ payeeType: 'partner', payeeId: PARTNER_ID, query }]);
  });
});
