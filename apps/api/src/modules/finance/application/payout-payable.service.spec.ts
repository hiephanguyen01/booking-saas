import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayoutPayableService } from './payout-payable.service';
import type { ILedgerRepository } from '../domain/ports/ledger-repository.port';
import type { IPayoutRepository } from '../domain/ports/payout-repository.port';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PARTNER = '22222222-2222-2222-2222-222222222222';

function makeLedger(overrides: Partial<ILedgerRepository> = {}): ILedgerRepository {
  return {
    recordJournal: vi.fn(),
    entriesForBooking: vi.fn(),
    ownerBalance: vi.fn().mockResolvedValue({ ownerType: 'partner', ownerId: PARTNER, debit: 0n, credit: 0n }),
    balancesByType: vi.fn(),
    entriesForOwner: vi.fn(),
    listEntries: vi.fn(),
    maturePayable: vi.fn().mockResolvedValue(0n),
    ...overrides,
  } as ILedgerRepository;
}

function makePayouts(overrides: Partial<IPayoutRepository> = {}): IPayoutRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    listForPayee: vi.fn(),
    markPaid: vi.fn(),
    markFailed: vi.fn(),
    outstandingForPayee: vi.fn().mockResolvedValue(0n),
    ...overrides,
  } as IPayoutRepository;
}

/** Stand-in tx exposing only the tenant read the policy makes. */
function makeTx(settings: unknown = {}): PrismaTx {
  return { tenant: { findUnique: vi.fn().mockResolvedValue({ settings }) } } as unknown as PrismaTx;
}

describe('PayoutPayableService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pays out mature − outstanding, NOT the raw ledger balance', async () => {
    const ledger = makeLedger({
      ownerBalance: vi.fn().mockResolvedValue({ ownerType: 'partner', ownerId: PARTNER, debit: 0n, credit: 5_000_000n }),
      maturePayable: vi.fn().mockResolvedValue(2_000_000n),
    });
    const payouts = makePayouts({ outstandingForPayee: vi.fn().mockResolvedValue(500_000n) });

    const s = await new PayoutPayableService(ledger, payouts).compute(makeTx(), TENANT, 'partner', PARTNER);

    expect(s.balance).toBe(5_000_000n);
    expect(s.available).toBe(1_500_000n);
    expect(s.eligible).toBe(true);
    expect(s.ineligibleReason).toBeNull();
  });

  it('is NOTHING_TO_PAY when a healthy balance has not cleared the holding window', async () => {
    // The exact shape of the reported bug: the payee looks flush in the ledger,
    // but every đồng is still inside the dispute buffer, so a run pays nothing.
    const ledger = makeLedger({
      ownerBalance: vi.fn().mockResolvedValue({ ownerType: 'partner', ownerId: PARTNER, debit: 0n, credit: 5_000_000n }),
      maturePayable: vi.fn().mockResolvedValue(0n),
    });

    const s = await new PayoutPayableService(ledger, makePayouts()).compute(makeTx(), TENANT, 'partner', PARTNER);

    expect(s.balance).toBe(5_000_000n);
    expect(s.available).toBe(0n);
    expect(s.eligible).toBe(false);
    expect(s.ineligibleReason).toBe('NOTHING_TO_PAY');
  });

  it('is NOTHING_TO_PAY when an unsettled run already claims the mature payable', async () => {
    const ledger = makeLedger({ maturePayable: vi.fn().mockResolvedValue(1_000_000n) });
    const payouts = makePayouts({ outstandingForPayee: vi.fn().mockResolvedValue(1_000_000n) });

    const s = await new PayoutPayableService(ledger, payouts).compute(makeTx(), TENANT, 'partner', PARTNER);

    expect(s.available).toBe(0n);
    expect(s.ineligibleReason).toBe('NOTHING_TO_PAY');
  });

  it('is BELOW_MINIMUM when the available payable is under the tenant minimum', async () => {
    const ledger = makeLedger({ maturePayable: vi.fn().mockResolvedValue(100_000n) });
    const tx = makeTx({ payout: { minAmount: '500000' } });

    const s = await new PayoutPayableService(ledger, makePayouts()).compute(tx, TENANT, 'partner', PARTNER);

    expect(s.available).toBe(100_000n);
    expect(s.policy.minAmount).toBe(500_000n);
    expect(s.eligible).toBe(false);
    expect(s.ineligibleReason).toBe('BELOW_MINIMUM');
  });

  it('measures maturity against now − holdingDays', async () => {
    const ledger = makeLedger();
    const tx = makeTx({ payout: { holdingDays: 7 } });

    const s = await new PayoutPayableService(ledger, makePayouts()).compute(tx, TENANT, 'partner', PARTNER);

    expect(s.policy.holdingDays).toBe(7);
    const [call] = vi.mocked(ledger.maturePayable).mock.calls;
    if (!call) throw new Error('maturePayable was never called');
    const expected = Date.now() - 7 * 86_400_000;
    expect(Math.abs(call[3].getTime() - expected)).toBeLessThan(5_000);
  });

  it('reads the payout policy keyed on the tenant', async () => {
    // `tenants` carries no RLS policy, so an unkeyed findFirst here would read an
    // arbitrary tenant's holding days / minimum.
    const tx = makeTx();
    await new PayoutPayableService(makeLedger(), makePayouts()).compute(tx, TENANT, 'partner', PARTNER);

    expect(tx.tenant.findUnique).toHaveBeenCalledWith({ where: { id: TENANT }, select: { settings: true } });
  });

  it('falls back to the default policy when the tenant has none configured', async () => {
    const s = await new PayoutPayableService(makeLedger(), makePayouts()).compute(
      makeTx({}),
      TENANT,
      'partner',
      PARTNER,
    );

    expect(s.policy).toEqual({ holdingDays: 3, minAmount: 0n, cycle: 'monthly' });
  });
});
