import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPayoutPolicyStore } from '../../domain/ports/payout-policy-store.port';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';

const TENANT_ID = 'tenant-1';

function harness(stored: unknown) {
  return new GetPayoutPolicyUseCase(
    fakePort<IPayoutPolicyStore>({ readTenantSettings: () => Promise.resolve(stored as never) }),
  );
}

describe('GetPayoutPolicyUseCase', () => {
  it('normalises a configured policy out of tenants.settings', async () => {
    const tx = fakeTenantDb().tx;
    const policy = await harness({
      payout: { holdingDays: 7, minAmount: '100000', cycle: 'weekly' },
    }).execute(tx, TENANT_ID);

    expect(policy).toMatchObject({ holdingDays: 7, minAmount: 100_000n, cycle: 'weekly' });
  });

  it('falls back to a safe default when nothing is configured', async () => {
    // A tenant that has never opened the settings page still needs a dispute
    // buffer; three days is the platform default rather than zero.
    const tx = fakeTenantDb().tx;
    const policy = await harness(null).execute(tx, TENANT_ID);

    expect(policy).toMatchObject({ holdingDays: 3, minAmount: 0n, cycle: 'monthly' });
  });

  it.each([
    ['negative', -1],
    ['fractional', 2.5],
    ['beyond the cap', 400],
  ])('ignores a %s holding period', async (_label, holdingDays) => {
    const tx = fakeTenantDb().tx;
    const policy = await harness({ payout: { holdingDays } }).execute(tx, TENANT_ID);

    expect(policy.holdingDays).toBe(3);
  });

  it('ignores a minimum that is not a whole đồng amount', async () => {
    // The column is a string; anything that is not digits would become a NaN
    // BigInt and take every payout comparison with it.
    const tx = fakeTenantDb().tx;
    const policy = await harness({ payout: { minAmount: '10.5' } }).execute(tx, TENANT_ID);

    expect(policy.minAmount).toBe(0n);
  });

  it('takes no cycle other than weekly as monthly', async () => {
    const tx = fakeTenantDb().tx;

    expect((await harness({ payout: { cycle: 'daily' } }).execute(tx, TENANT_ID)).cycle).toBe(
      'monthly',
    );
  });
});
