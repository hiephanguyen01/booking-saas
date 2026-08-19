import { describe, expect, it } from 'vitest';
import type { TenantPayableQuery } from '@booking/contracts';
import { fakeCollaborator, fakeTenantDb } from '~testing';
import type { ComputePayoutPayableUseCase } from './compute-payout-payable.use-case';
import { GetTenantPayableUseCase } from './get-tenant-payable.use-case';

const TENANT_ID = 'tenant-1';

describe('GetTenantPayableUseCase', () => {
  it('previews through the SAME computation the payout run pays from', async () => {
    // The preview and the run must not drift: the dialog used to show the raw
    // ledger balance and the run then failed with NOTHING_TO_PAY.
    const calls: unknown[] = [];
    const snapshot = { available: 500_000n } as never;
    const tenantDb = fakeTenantDb();
    const useCase = new GetTenantPayableUseCase(
      fakeCollaborator<ComputePayoutPayableUseCase>({
        execute: (...args: unknown[]) => {
          calls.push(args.slice(1));
          return Promise.resolve(snapshot);
        },
      }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(TENANT_ID, {
        payeeType: 'partner',
        payeeId: 'partner-1',
      } as TenantPayableQuery),
    ).resolves.toBe(snapshot);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([[TENANT_ID, 'partner', 'partner-1']]);
  });
});
