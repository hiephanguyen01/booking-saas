import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PayoutNotFound,
  PayoutSettled,
  PayoutStateChanged,
} from '../../domain/errors/finance-domain-errors';
import type { IPayoutRepository, PayoutRecord } from '../../domain/ports/payout-repository.port';
import { FailPayoutUseCase } from './fail-payout.use-case';

const TENANT_ID = 'tenant-1';
const PAYOUT_ID = 'payout-1';

const payout = (status = 'pending'): PayoutRecord =>
  ({ id: PAYOUT_ID, tenantId: TENANT_ID, status, amount: 500_000n }) as unknown as PayoutRecord;

function harness(record: PayoutRecord | null, updated: PayoutRecord | null = payout('failed')) {
  const calls: string[] = [];
  const audits: AuditEntry[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new FailPayoutUseCase(
      fakePort<IPayoutRepository>({
        findById: () => Promise.resolve(record),
        markFailed: () => {
          calls.push('markFailed');
          return Promise.resolve(updated);
        },
        releaseAllocations: () => {
          calls.push('releaseAllocations');
          return Promise.resolve();
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          calls.push('audit');
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
    audits,
  };
}

describe('FailPayoutUseCase', () => {
  it('rejects an unknown payout', async () => {
    const { useCase, calls } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, PAYOUT_ID, 'wrong account', 'admin-1'),
    ).rejects.toBeInstanceOf(PayoutNotFound);
    expect(calls).toEqual([]);
  });

  it('refuses to fail a payout that is already paid', async () => {
    // The money left the account; the run cannot be walked back by flipping a flag.
    const { useCase, calls } = harness(payout('paid'));

    await expect(
      useCase.execute(TENANT_ID, PAYOUT_ID, 'wrong account', 'admin-1'),
    ).rejects.toBeInstanceOf(PayoutSettled);
    expect(calls).toEqual([]);
  });

  it('releases the settlement allocations so the shares roll into the next cycle', async () => {
    // No ledger journal was ever written for a pending payout, so nothing has to
    // be reversed — but the FIFO allocations must be handed back or the amount
    // stays claimed by a run that will never pay.
    const { useCase, tenantDb, calls, audits } = harness(payout('pending'));

    await useCase.execute(TENANT_ID, PAYOUT_ID, 'sai số tài khoản', 'admin-1');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual(['markFailed', 'releaseAllocations', 'audit']);
    expect(audits[0]).toMatchObject({
      action: 'payout.failed',
      entityId: PAYOUT_ID,
      actorUserId: 'admin-1',
      data: { reason: 'sai số tài khoản' },
    });
  });

  it('fails when the guarded write matched no row', async () => {
    const { useCase, calls } = harness(payout('pending'), null);

    await expect(useCase.execute(TENANT_ID, PAYOUT_ID, null, 'admin-1')).rejects.toBeInstanceOf(
      PayoutStateChanged,
    );
    expect(calls).not.toContain('releaseAllocations');
  });
});
