import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  NothingToPay,
  PayoutAllocationMismatch,
  PayoutBelowMinimum,
} from '../../domain/errors/finance-domain-errors';
import type {
  CreatePayoutData,
  IPayoutRepository,
  PayoutRecord,
} from '../../domain/ports/payout-repository.port';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import type { ComputePayoutPayableUseCase } from './compute-payout-payable.use-case';
import { CreatePayoutUseCase } from './create-payout.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const CUTOFF = new Date('2026-08-15T09:00:00Z');
const AVAILABLE = 750_000n;

type Payable = Awaited<ReturnType<ComputePayoutPayableUseCase['execute']>>;

function payable(overrides: Partial<Payable> = {}): Payable {
  return {
    payeeType: 'partner',
    payeeId: PARTNER_ID,
    balance: 900_000n,
    maturePayable: AVAILABLE,
    outstanding: 0n,
    available: AVAILABLE,
    cutoff: CUTOFF,
    policy: PayoutPolicy.fromStored({
      payout: { holdingDays: 3, minAmount: '100000', cycle: 'monthly' },
    }),
    eligible: true,
    ineligibleReason: null,
    ...overrides,
  } as Payable;
}

interface Options {
  snapshot?: Payable;
  /** What `allocateReleasedSettlements` managed to back with released settlements. */
  allocated?: bigint;
}

interface Harness {
  readonly useCase: CreatePayoutUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly calls: string[];
  readonly created: CreatePayoutData[];
  readonly audits: AuditEntry[];
}

function harness(options: Options = {}): Harness {
  const calls: string[] = [];
  const created: CreatePayoutData[] = [];
  const audits: AuditEntry[] = [];
  const tenantDb = fakeTenantDb();

  const payouts = fakePort<IPayoutRepository>({
    lockPayee: () => {
      calls.push('lock');
      return Promise.resolve();
    },
    create: (_tx, _tenantId, data) => {
      calls.push('create');
      created.push(data);
      return Promise.resolve({
        id: 'payout-1',
        ...data,
        status: 'pending',
      } as unknown as PayoutRecord);
    },
    allocateReleasedSettlements: () => {
      calls.push('allocate');
      return Promise.resolve(options.allocated ?? (options.snapshot ?? payable()).available);
    },
  });
  const audit = fakePort<IAuditWriter>({
    write: (_tx, entry) => {
      calls.push('audit');
      audits.push(entry);
      return Promise.resolve();
    },
  });
  const compute = fakeCollaborator<ComputePayoutPayableUseCase>({
    execute: () => {
      calls.push('payable');
      return Promise.resolve(options.snapshot ?? payable());
    },
  });

  return {
    useCase: new CreatePayoutUseCase(payouts, audit, compute, tenantDb.service),
    tenantDb,
    calls,
    created,
    audits,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({ payeeType: 'partner', payeeId: PARTNER_ID, ...overrides }) as Parameters<
    CreatePayoutUseCase['execute']
  >[1];

describe('CreatePayoutUseCase', () => {
  it('locks the payee before reading what is payable', async () => {
    // Preview and claim must be serialised: without the lock two concurrent
    // requests both read the same `available` and each opens a run for it.
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, input(), 'admin-1');

    expect(calls.slice(0, 2)).toEqual(['lock', 'payable']);
  });

  it('pays exactly what the preview said, in one transaction', async () => {
    const { useCase, tenantDb, created } = harness();

    await useCase.execute(TENANT_ID, input(), 'admin-1');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      payeeType: 'partner',
      payeeId: PARTNER_ID,
      amount: AVAILABLE,
      createdBy: 'admin-1',
    });
  });

  it('refuses a run when nothing has matured', async () => {
    const { useCase, calls } = harness({
      snapshot: payable({ available: 0n, eligible: false, ineligibleReason: 'NOTHING_TO_PAY' }),
    });

    await expect(useCase.execute(TENANT_ID, input(), 'admin-1')).rejects.toBeInstanceOf(
      NothingToPay,
    );
    expect(calls).not.toContain('create');
  });

  it('refuses a run below the tenant minimum', async () => {
    const { useCase, calls } = harness({
      snapshot: payable({ available: 50_000n, eligible: false, ineligibleReason: 'BELOW_MINIMUM' }),
    });

    await expect(useCase.execute(TENANT_ID, input(), 'admin-1')).rejects.toBeInstanceOf(
      PayoutBelowMinimum,
    );
    expect(calls).not.toContain('create');
  });

  it('derives a monthly period backwards from the ledger cutoff', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input(), 'admin-1');

    expect(created[0]?.periodTo).toEqual(CUTOFF);
    expect(created[0]?.periodFrom).toEqual(new Date(CUTOFF.getTime() - 30 * 86_400_000));
  });

  it('honours an explicitly requested period', async () => {
    const { useCase, created } = harness();

    await useCase.execute(
      TENANT_ID,
      input({ periodFrom: '2026-07-01T00:00:00.000Z', periodTo: '2026-07-31T00:00:00.000Z' }),
      'admin-1',
    );

    expect(created[0]?.periodFrom).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(created[0]?.periodTo).toEqual(new Date('2026-07-31T00:00:00.000Z'));
  });

  it('backs a partner run with released settlements', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, input(), 'admin-1');

    expect(calls).toEqual(['lock', 'payable', 'create', 'allocate', 'audit']);
  });

  it('rejects the run when the FIFO allocation cannot cover the amount', async () => {
    // Throwing rolls the payout and every tentative allocation back, rather than
    // opening a run for money no released settlement backs.
    const { useCase, calls } = harness({ allocated: AVAILABLE - 1n });

    await expect(useCase.execute(TENANT_ID, input(), 'admin-1')).rejects.toBeInstanceOf(
      PayoutAllocationMismatch,
    );
    expect(calls).not.toContain('audit');
  });

  it('skips settlement allocation for an affiliate run', async () => {
    // Affiliate earnings are not settlement-backed; asking for an allocation
    // would fail every affiliate payout.
    const { useCase, calls } = harness({
      snapshot: payable({ payeeType: 'affiliate', payeeId: 'affiliate-1' }),
    });

    await useCase.execute(
      TENANT_ID,
      input({ payeeType: 'affiliate', payeeId: 'affiliate-1' }),
      'admin-1',
    );

    expect(calls).not.toContain('allocate');
  });

  it('writes the audit row inside the same transaction', async () => {
    const { useCase, audits } = harness();

    await useCase.execute(TENANT_ID, input(), 'admin-1');

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: 'admin-1',
        action: 'payout.created',
        entityType: 'payout',
        entityId: 'payout-1',
        data: { amount: AVAILABLE.toString() },
      },
    ]);
  });
});
