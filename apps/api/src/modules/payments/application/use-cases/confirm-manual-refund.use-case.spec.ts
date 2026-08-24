import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ConfirmManualRefundInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  RefundNotConfirmable,
  RefundNotFound,
  RefundReferenceAlreadyUsed,
} from '../../domain/errors/refund-errors';
import type { IRefundBatchRepository } from '../../domain/ports/refund-batch-repository.port';
import type { IRefundRepository, RefundRecord } from '../../domain/ports/refund-repository.port';
import { ConfirmManualRefundUseCase } from './confirm-manual-refund.use-case';

const TENANT_ID = 'tenant-1';
const REFUND_ID = 'refund-1';
const BOOKING_ID = 'booking-1';

const refund = (overrides: Partial<RefundRecord> = {}): RefundRecord =>
  ({
    id: REFUND_ID,
    tenantId: TENANT_ID,
    refundBatchId: null,
    paymentId: 'payment-1',
    bookingId: BOOKING_ID,
    amount: 300_000n,
    status: 'manual_required',
    gatewayRefundId: null,
    reason: 'booking_cancellation',
    affectsBookingStatus: true,
    evidence: null,
    executionMode: 'manual',
    dueAt: null,
    completedAt: null,
    ...overrides,
  }) as RefundRecord;

interface Options {
  record?: RefundRecord | null;
  /** What the second read (under the lock) sees, if it differs. */
  afterLock?: RefundRecord | null;
  referenceUsed?: boolean;
  updated?: RefundRecord | null;
}

function harness(options: Options = {}) {
  const calls: string[] = [];
  const audits: AuditEntry[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  let reads = 0;

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });

  const refunds = fakePort<IRefundRepository>({
    findById: () => {
      reads += 1;
      calls.push('find');
      if (reads > 1 && options.afterLock !== undefined) return Promise.resolve(options.afterLock);
      return Promise.resolve(options.record === undefined ? refund() : options.record);
    },
    lockForBooking: () => {
      calls.push('lock');
      return Promise.resolve();
    },
    manualReferenceExists: () => Promise.resolve(options.referenceUsed ?? false),
    markSucceeded: () => {
      calls.push('markSucceeded');
      return Promise.resolve(
        options.updated === undefined ? refund({ status: 'succeeded' }) : options.updated,
      );
    },
  });

  const refundBatches = fakePort<IRefundBatchRepository>({
    refreshStatus: () => Promise.resolve(null),
  });

  return {
    useCase: new ConfirmManualRefundUseCase(
      refundBatches,
      refunds,
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    calls,
    audits,
    events,
  };
}

const input = { reference: 'VCB-77', evidenceKey: 'uploads/proof.png' } as ConfirmManualRefundInput;

describe('ConfirmManualRefundUseCase', () => {
  it('rejects an unknown refund', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, REFUND_ID, input, 'admin-1')).rejects.toBeInstanceOf(
      RefundNotFound,
    );
  });

  it('re-reads the refund under the booking lock before deciding', async () => {
    // Two staff confirming the same transfer: the second waits on the lock and
    // must then see the first one's result, not the row it read before waiting.
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, REFUND_ID, input, 'admin-1');

    expect(calls.slice(0, 3)).toEqual(['find', 'lock', 'find']);
  });

  it('is a no-op when the refund succeeded while this request waited', async () => {
    const { useCase, calls, events } = harness({ afterLock: refund({ status: 'succeeded' }) });

    await useCase.execute(TENANT_ID, REFUND_ID, input, 'admin-1');

    expect(calls).not.toContain('markSucceeded');
    expect(events).toEqual([]);
  });

  it('refuses to confirm a refund that already failed', async () => {
    const { useCase } = harness({ record: refund({ status: 'failed' }) });

    await expect(useCase.execute(TENANT_ID, REFUND_ID, input, 'admin-1')).rejects.toBeInstanceOf(
      RefundNotConfirmable,
    );
  });

  it('refuses a bank reference that was already used for another refund', async () => {
    // One transfer, one refund: reusing a reference is how a single bank payment
    // gets claimed against two refunds.
    const { useCase, calls } = harness({ referenceUsed: true });

    await expect(useCase.execute(TENANT_ID, REFUND_ID, input, 'admin-1')).rejects.toBeInstanceOf(
      RefundReferenceAlreadyUsed,
    );
    expect(calls).not.toContain('markSucceeded');
  });

  it('fails when the guarded write matched no row', async () => {
    const { useCase } = harness({ updated: null });

    await expect(useCase.execute(TENANT_ID, REFUND_ID, input, 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('records the evidence and announces the completed refund', async () => {
    const { useCase, audits, events } = harness();

    await useCase.execute(TENANT_ID, REFUND_ID, input, 'admin-1');

    expect(audits[0]).toMatchObject({
      tenantId: TENANT_ID,
      actorUserId: 'admin-1',
      action: 'refund.manual_confirmed',
      entityId: REFUND_ID,
      data: {
        reference: 'VCB-77',
        evidenceKey: 'uploads/proof.png',
        note: null,
        amount: '300000',
      },
    });
    expect(events).toEqual([
      {
        eventType: 'refund.completed',
        payload: {
          refundId: REFUND_ID,
          paymentId: 'payment-1',
          bookingId: BOOKING_ID,
          amount: '300000',
          reason: 'booking_cancellation',
          affectsBookingStatus: true,
        },
      },
    ]);
  });
});
