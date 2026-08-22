import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import type { IPayoutRepository } from '../../domain/ports/payout-repository.port';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import { ComputePayoutPayableUseCase } from './compute-payout-payable.use-case';
import type { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const CUTOFF = new Date('2026-08-15T09:00:00Z');

const policy = (minAmount: string, holdingDays = 3): PayoutPolicy =>
  PayoutPolicy.fromStored({ payout: { holdingDays, minAmount, cycle: 'monthly' } });

interface Amounts {
  credit?: bigint;
  debit?: bigint;
  mature?: bigint;
  outstanding?: bigint;
  minAmount?: string;
}

function harness(amounts: Amounts = {}) {
  const tenantDb = fakeTenantDb();
  const ledger = fakePort<ILedgerRepository>({
    ownerBalance: () =>
      Promise.resolve({
        ownerType: 'partner' as const,
        ownerId: PARTNER_ID,
        credit: amounts.credit ?? 1_000_000n,
        debit: amounts.debit ?? 0n,
      } as Awaited<ReturnType<ILedgerRepository['ownerBalance']>>),
    maturePayable: () => Promise.resolve({ amount: amounts.mature ?? 800_000n, cutoff: CUTOFF }),
  });
  const payouts = fakePort<IPayoutRepository>({
    outstandingForPayee: () => Promise.resolve(amounts.outstanding ?? 0n),
  });
  const getPolicy = fakeCollaborator<GetPayoutPolicyUseCase>({
    execute: () => Promise.resolve(policy(amounts.minAmount ?? '0')),
  });

  return {
    useCase: new ComputePayoutPayableUseCase(ledger, payouts, getPolicy),
    tx: tenantDb.tx,
  };
}

describe('ComputePayoutPayableUseCase', () => {
  it('pays the matured amount minus what pending runs already claimed', async () => {
    // The bug this pins: the payout dialog used to show the raw ledger balance.
    // Doing that displays the same payable twice and makes the next run fail.
    const { useCase, tx } = harness({ mature: 800_000n, outstanding: 300_000n });

    const snapshot = await useCase.execute(tx, TENANT_ID, 'partner', PARTNER_ID);

    expect(snapshot.available).toBe(500_000n);
    expect(snapshot.maturePayable).toBe(800_000n);
    expect(snapshot.outstanding).toBe(300_000n);
  });

  it('reports the raw ledger balance as context, never as the payable', async () => {
    // Held settlement funds are absent from the ledger until release, so balance
    // and available legitimately differ; the snapshot must not conflate them.
    const { useCase, tx } = harness({
      credit: 1_000_000n,
      debit: 100_000n,
      mature: 400_000n,
      outstanding: 0n,
    });

    const snapshot = await useCase.execute(tx, TENANT_ID, 'partner', PARTNER_ID);

    expect(snapshot.balance).toBe(900_000n);
    expect(snapshot.available).toBe(400_000n);
  });

  it('is NOTHING_TO_PAY when nothing has matured', async () => {
    const { useCase, tx } = harness({ mature: 0n, outstanding: 0n });

    const snapshot = await useCase.execute(tx, TENANT_ID, 'partner', PARTNER_ID);

    expect(snapshot).toMatchObject({ eligible: false, ineligibleReason: 'NOTHING_TO_PAY' });
  });

  it('is NOTHING_TO_PAY when pending runs already claim more than has matured', async () => {
    const { useCase, tx } = harness({ mature: 200_000n, outstanding: 500_000n });

    const snapshot = await useCase.execute(tx, TENANT_ID, 'partner', PARTNER_ID);

    expect(snapshot.available).toBe(-300_000n);
    expect(snapshot.ineligibleReason).toBe('NOTHING_TO_PAY');
  });

  it('is BELOW_MINIMUM when something is payable but under the policy floor', async () => {
    const { useCase, tx } = harness({ mature: 40_000n, outstanding: 0n, minAmount: '50000' });

    const snapshot = await useCase.execute(tx, TENANT_ID, 'partner', PARTNER_ID);

    expect(snapshot).toMatchObject({ eligible: false, ineligibleReason: 'BELOW_MINIMUM' });
  });

  it('treats the minimum as inclusive', async () => {
    const { useCase, tx } = harness({ mature: 50_000n, outstanding: 0n, minAmount: '50000' });

    const snapshot = await useCase.execute(tx, TENANT_ID, 'partner', PARTNER_ID);

    expect(snapshot).toMatchObject({ eligible: true, ineligibleReason: null });
  });

  it('checks NOTHING_TO_PAY before BELOW_MINIMUM, as the run itself does', async () => {
    // `ineligibleReason` has to name the code the run would actually reject with,
    // and zero payable under a non-zero floor satisfies both conditions.
    const { useCase, tx } = harness({ mature: 0n, outstanding: 0n, minAmount: '50000' });

    expect((await useCase.execute(tx, TENANT_ID, 'partner', PARTNER_ID)).ineligibleReason).toBe(
      'NOTHING_TO_PAY',
    );
  });

  it('carries the ledger cutoff and the payee through unchanged', async () => {
    const { useCase, tx } = harness();

    const snapshot = await useCase.execute(tx, TENANT_ID, 'affiliate', 'affiliate-9');

    expect(snapshot).toMatchObject({
      cutoff: CUTOFF,
      payeeType: 'affiliate',
      payeeId: 'affiliate-9',
    });
  });

  it('returns the tenant policy so the preview and the run share one floor', async () => {
    const { useCase, tx } = harness({ minAmount: '50000' });

    expect((await useCase.execute(tx, TENANT_ID, 'partner', PARTNER_ID)).policy.minAmount).toBe(
      50_000n,
    );
  });
});
