import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PayoutInProgress,
  PayoutNotFound,
  PayoutSettled,
  PayoutStateChanged,
} from '../../domain/errors/finance-domain-errors';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import type { IPayoutRepository, PayoutRecord } from '../../domain/ports/payout-repository.port';
import { MarkPayoutPaidUseCase } from './mark-payout-paid.use-case';

const TENANT_ID = 'tenant-1';
const PAYOUT_ID = 'payout-1';
const PARTNER_ID = 'partner-1';
const AMOUNT = 750_000n;

function payout(overrides: Partial<PayoutRecord> = {}): PayoutRecord {
  return {
    id: PAYOUT_ID,
    tenantId: TENANT_ID,
    payeeType: 'partner',
    payeeId: PARTNER_ID,
    amount: AMOUNT,
    periodFrom: new Date('2026-07-15T00:00:00Z'),
    periodTo: new Date('2026-08-15T00:00:00Z'),
    status: 'pending',
    paidAt: null,
    evidence: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-08-15T09:00:00Z'),
    ...overrides,
  } as PayoutRecord;
}

interface Options {
  record?: PayoutRecord | null;
  claimed?: PayoutRecord | null;
  updated?: PayoutRecord | null;
}

function harness(options: Options = {}) {
  const calls: string[] = [];
  const journals: Array<{ legs: unknown; meta: unknown }> = [];
  const audits: AuditEntry[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });

  const payouts = fakePort<IPayoutRepository>({
    findById: () => Promise.resolve(options.record === undefined ? payout() : options.record),
    claimForPayment: () => {
      calls.push('claim');
      return Promise.resolve(
        options.claimed === undefined ? payout({ status: 'processing' }) : options.claimed,
      );
    },
    markPaid: () => {
      calls.push('markPaid');
      return Promise.resolve(
        options.updated === undefined ? payout({ status: 'paid' }) : options.updated,
      );
    },
    markAllocationsPaid: () => {
      calls.push('markAllocationsPaid');
      return Promise.resolve();
    },
  });
  const ledger = fakePort<ILedgerRepository>({
    recordJournal: (_tx, _tenantId, legs, meta) => {
      calls.push('journal');
      journals.push({ legs, meta });
      return Promise.resolve('journal-1');
    },
  });
  const audit = fakePort<IAuditWriter>({
    write: (_tx, entry) => {
      calls.push('audit');
      audits.push(entry);
      return Promise.resolve();
    },
  });

  return {
    useCase: new MarkPayoutPaidUseCase(
      payouts,
      ledger,
      audit,
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    calls,
    journals,
    audits,
    events,
  };
}

const input = { reference: 'VCB-99', evidenceKey: 'uploads/proof.png' };

describe('MarkPayoutPaidUseCase', () => {
  it('rejects an unknown payout', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, PAYOUT_ID, input, 'admin-1')).rejects.toBeInstanceOf(
      PayoutNotFound,
    );
  });

  it('is a no-op on a payout that is already paid', async () => {
    // The transfer happened once; writing the journal again would move the payee's
    // balance twice for one payment.
    const { useCase, calls, events } = harness({ record: payout({ status: 'paid' }) });

    await useCase.execute(TENANT_ID, PAYOUT_ID, input, 'admin-1');

    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  it('refuses to pay a failed payout', async () => {
    const { useCase } = harness({ record: payout({ status: 'failed' }) });

    await expect(useCase.execute(TENANT_ID, PAYOUT_ID, input, 'admin-1')).rejects.toBeInstanceOf(
      PayoutSettled,
    );
  });

  it('refuses when another request already claimed the payout', async () => {
    const { useCase, calls } = harness({ claimed: null });

    await expect(useCase.execute(TENANT_ID, PAYOUT_ID, input, 'admin-1')).rejects.toBeInstanceOf(
      PayoutInProgress,
    );
    expect(calls).not.toContain('journal');
  });

  it('claims the payout before writing the journal', async () => {
    // The claim is the compare-and-set that makes two concurrent "mark paid"
    // requests produce one journal.
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, PAYOUT_ID, input, 'admin-1');

    expect(calls.indexOf('claim')).toBeLessThan(calls.indexOf('journal'));
  });

  it('books the transfer against the payout and names the reference in the memo', async () => {
    const { useCase, tenantDb, journals } = harness();

    await useCase.execute(TENANT_ID, PAYOUT_ID, input, 'admin-1');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(journals[0]?.meta).toEqual({ payoutId: PAYOUT_ID, memo: 'payout VCB-99' });
  });

  it('fails loudly when the guarded paid-write matched no row', async () => {
    const { useCase } = harness({ updated: null });

    await expect(useCase.execute(TENANT_ID, PAYOUT_ID, input, 'admin-1')).rejects.toBeInstanceOf(
      PayoutStateChanged,
    );
  });

  it('settles the allocations, audits the transfer and notifies the payee', async () => {
    const { useCase, calls, audits, events } = harness();

    await useCase.execute(TENANT_ID, PAYOUT_ID, input, 'admin-1');

    expect(calls).toEqual(['claim', 'journal', 'markPaid', 'markAllocationsPaid', 'audit']);
    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: 'admin-1',
        action: 'payout.paid',
        entityType: 'payout',
        entityId: PAYOUT_ID,
        data: { reference: 'VCB-99' },
      },
    ]);
    expect(events).toEqual([
      {
        eventType: 'payout.paid',
        payload: {
          payoutId: PAYOUT_ID,
          payeeType: 'partner',
          payeeId: PARTNER_ID,
          amount: AMOUNT.toString(),
        },
      },
    ]);
  });
});
