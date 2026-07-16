import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePayoutUseCase } from './create-payout.use-case';
import { GetTenantPayableUseCase } from './get-tenant-payable.use-case';
import { PayoutPayableService } from '../payout-payable.service';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import type { IPayoutRepository } from '../../domain/ports/payout-repository.port';
import type { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PARTNER = '22222222-2222-2222-2222-222222222222';

function makeLedger(maturePayable: bigint, credit: bigint): ILedgerRepository {
  return {
    recordJournal: vi.fn(),
    entriesForBooking: vi.fn(),
    ownerBalance: vi.fn().mockResolvedValue({ ownerType: 'partner', ownerId: PARTNER, debit: 0n, credit }),
    balancesByType: vi.fn(),
    entriesForOwner: vi.fn(),
    listEntries: vi.fn(),
    maturePayable: vi.fn().mockResolvedValue(maturePayable),
  } as unknown as ILedgerRepository;
}

function makePayouts(outstanding: bigint): IPayoutRepository {
  return {
    create: vi.fn().mockImplementation((_tx, _t, data) => ({ id: 'payout-1', ...data })),
    findById: vi.fn(),
    list: vi.fn(),
    listForPayee: vi.fn(),
    markPaid: vi.fn(),
    markFailed: vi.fn(),
    outstandingForPayee: vi.fn().mockResolvedValue(outstanding),
  } as unknown as IPayoutRepository;
}

const audit = { write: vi.fn() } as unknown as IAuditWriter;

/** forTenant runs the callback against a tx exposing only the policy read. */
function makeTenantDb(settings: unknown = {}): TenantDbService {
  const tx = { tenant: { findUnique: vi.fn().mockResolvedValue({ settings }) } };
  return { forTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) } as unknown as TenantDbService;
}

const input = { payeeType: 'partner', payeeId: PARTNER } as const;

describe('CreatePayoutUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pays exactly what GET /tenant/finance/payable previewed', async () => {
    // The regression guard for the reported bug: the dialog showed the raw ledger
    // balance (5,000,000) while the run paid mature − outstanding (1,500,000).
    // Both surfaces now resolve through PayoutPayableService, so they cannot drift.
    const ledger = makeLedger(2_000_000n, 5_000_000n);
    const payouts = makePayouts(500_000n);
    const payable = new PayoutPayableService(ledger, payouts);

    const preview = await new GetTenantPayableUseCase(payable, makeTenantDb()).execute(TENANT, input);
    const payout = await new CreatePayoutUseCase(payouts, audit, payable, makeTenantDb()).execute(TENANT, input, 'user-1');

    expect(preview.available).toBe(1_500_000n);
    expect(preview.balance).toBe(5_000_000n); // what the dialog used to show
    expect(payout.amount).toBe(preview.available);
  });

  it('rejects NOTHING_TO_PAY with the code the preview names', async () => {
    const ledger = makeLedger(0n, 5_000_000n);
    const payouts = makePayouts(0n);
    const payable = new PayoutPayableService(ledger, payouts);

    const preview = await new GetTenantPayableUseCase(payable, makeTenantDb()).execute(TENANT, input);
    expect(preview.ineligibleReason).toBe('NOTHING_TO_PAY');

    await expect(
      new CreatePayoutUseCase(payouts, audit, payable, makeTenantDb()).execute(TENANT, input, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(payouts.create).not.toHaveBeenCalled();
  });

  it('rejects BELOW_MINIMUM with the code the preview names', async () => {
    const settings = { payout: { minAmount: '500000' } };
    const ledger = makeLedger(100_000n, 100_000n);
    const payouts = makePayouts(0n);
    const payable = new PayoutPayableService(ledger, payouts);

    const preview = await new GetTenantPayableUseCase(payable, makeTenantDb(settings)).execute(TENANT, input);
    expect(preview.ineligibleReason).toBe('BELOW_MINIMUM');

    await expect(
      new CreatePayoutUseCase(payouts, audit, payable, makeTenantDb(settings)).execute(TENANT, input, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(payouts.create).not.toHaveBeenCalled();
  });
});
