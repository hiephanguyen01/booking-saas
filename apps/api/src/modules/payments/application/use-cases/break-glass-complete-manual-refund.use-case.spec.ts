import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakePort,
  fakeTenantDb,
  fakeTx,
  MANUAL_REFUND_BATCH_ID,
  MANUAL_REFUND_BOOKING_ID,
  MANUAL_REFUND_CHECKER_ID,
  MANUAL_REFUND_MAKER_ID,
  MANUAL_REFUND_NOW,
  MANUAL_REFUND_OPERATION_ID,
  MANUAL_REFUND_TENANT_ID,
  manualRefundOperation,
} from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { ISessionStore } from '../../../identity-access/domain/ports/session-store.port';
import {
  ManualRefundFreshAuthenticationRequired,
  ManualRefundMakerCannotApproveOwnTransfer,
} from '../../domain/errors/manual-refund-errors';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import type { IRefundBatchRepository } from '../../domain/ports/refund-batch-repository.port';
import type { IRefundRepository } from '../../domain/ports/refund-repository.port';
import { BreakGlassCompleteManualRefundUseCase } from './break-glass-complete-manual-refund.use-case';

const submitted = () =>
  manualRefundOperation({
    status: 'transfer_submitted',
    transferReference: 'VCB-001',
    evidenceObjectKey: 'private/receipt.pdf',
    evidenceContentType: 'application/pdf',
    evidenceSizeBytes: 12,
    evidenceSha256: 'b'.repeat(64),
    evidenceVerifiedAt: MANUAL_REFUND_NOW,
    transferSubmittedByUserId: MANUAL_REFUND_MAKER_ID,
    transferSubmittedAt: MANUAL_REFUND_NOW,
  });

function harness(authenticatedAt: Date | null, current = submitted()) {
  const audits: unknown[] = [];
  const events: unknown[] = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: unknown) => {
        events.push(args);
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, now: MANUAL_REFUND_NOW });
  const useCase = new BreakGlassCompleteManualRefundUseCase(
    fakePort<IManualRefundOperationRepository>({
      findById: () => Promise.resolve(current),
      casUpdate: (_tx, _tenant, _id, _status, _version, patch) =>
        Promise.resolve({ ...current, ...patch, status: 'completed', version: 4 }),
    }),
    fakePort<IRefundRepository>({ completeManualBatch: () => Promise.resolve(2) }),
    fakePort<IRefundBatchRepository>({
      refreshStatus: () =>
        Promise.resolve({
          transitionedToCompleted: true,
          batch: {
            id: MANUAL_REFUND_BATCH_ID,
            tenantId: MANUAL_REFUND_TENANT_ID,
            bookingId: MANUAL_REFUND_BOOKING_ID,
            requestedAmount: 1_250_000n,
            reason: 'booking_cancellation',
            affectsBookingStatus: true,
            status: 'completed',
            completedAt: MANUAL_REFUND_NOW,
          },
        }),
    }),
    fakePort<IAuditWriter>({
      write: (_tx, entry) => {
        audits.push(entry);
        return Promise.resolve();
      },
    }),
    fakePort<ISessionStore>({ authenticationTime: () => Promise.resolve(authenticatedAt) }),
    new OutboxService(),
    tenantDb.service,
  );
  return { useCase, audits, events, tenantDb };
}

describe('BreakGlassCompleteManualRefundUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MANUAL_REFUND_NOW);
  });

  afterEach(() => vi.useRealTimers());

  it('requires authentication within five minutes before opening the tenant transaction', async () => {
    const { useCase, tenantDb } = harness(new Date('2026-09-04T12:50:00Z'));
    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        {
          expectedVersion: 3,
          reason: 'Incident commander approved emergency',
          confirmation: 'BREAK_GLASS',
        },
        {
          userId: MANUAL_REFUND_CHECKER_ID,
          sessionId: 'session-1',
          ip: '127.0.0.1',
        },
      ),
    ).rejects.toBeInstanceOf(ManualRefundFreshAuthenticationRequired);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('completes atomically and writes a high-severity audit with one batch event', async () => {
    const { useCase, audits, events } = harness(new Date('2026-09-04T12:58:00Z'));
    const result = await useCase.execute(
      MANUAL_REFUND_TENANT_ID,
      MANUAL_REFUND_OPERATION_ID,
      {
        expectedVersion: 3,
        reason: '  Incident commander approved emergency  ',
        confirmation: 'BREAK_GLASS',
      },
      {
        userId: MANUAL_REFUND_CHECKER_ID,
        sessionId: 'session-1',
        ip: '127.0.0.1',
      },
    );
    expect(audits[0]).toMatchObject({
      tenantId: MANUAL_REFUND_TENANT_ID,
      action: 'manual_refund.break_glass_completed',
      actorUserId: MANUAL_REFUND_CHECKER_ID,
      ip: '127.0.0.1',
      data: {
        severity: 'high',
        reason: 'Incident commander approved emergency',
      },
    });
    expect(JSON.stringify(audits)).not.toContain('secret-ciphertext');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      data: {
        tenantId: MANUAL_REFUND_TENANT_ID,
        eventType: 'refund.completed',
        payload: {
          refundId: MANUAL_REFUND_BATCH_ID,
          refundBatchId: MANUAL_REFUND_BATCH_ID,
          bookingId: MANUAL_REFUND_BOOKING_ID,
          amount: '1250000',
          reason: 'booking_cancellation',
          affectsBookingStatus: true,
        },
      },
    });
    expect(result).toEqual({
      id: MANUAL_REFUND_OPERATION_ID,
      status: 'completed',
      version: 4,
      completedAt: MANUAL_REFUND_NOW,
    });
  });

  it('does not let the transfer maker use break-glass completion', async () => {
    const { useCase } = harness(new Date('2026-09-04T12:58:00Z'));
    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        {
          expectedVersion: 3,
          reason: 'Incident commander approved emergency',
          confirmation: 'BREAK_GLASS',
        },
        { userId: MANUAL_REFUND_MAKER_ID, sessionId: 'session-1', ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(ManualRefundMakerCannotApproveOwnTransfer);
  });

  it('does not duplicate completion side effects when retried after completion', async () => {
    const completed = manualRefundOperation({
      ...submitted(),
      status: 'completed',
      version: 4,
      completedAt: MANUAL_REFUND_NOW,
      breakGlassByUserId: MANUAL_REFUND_CHECKER_ID,
      breakGlassReason: 'Incident commander approved emergency',
      breakGlassAuthenticatedAt: new Date('2026-09-04T12:58:00Z'),
      breakGlassAt: MANUAL_REFUND_NOW,
    });
    const { useCase, audits, events } = harness(new Date('2026-09-04T12:58:00Z'), completed);

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        {
          expectedVersion: 4,
          reason: 'Incident commander approved emergency',
          confirmation: 'BREAK_GLASS',
        },
        {
          userId: MANUAL_REFUND_CHECKER_ID,
          sessionId: 'session-1',
          ip: '127.0.0.1',
        },
      ),
    ).resolves.toEqual({
      id: MANUAL_REFUND_OPERATION_ID,
      status: 'completed',
      version: 4,
      completedAt: MANUAL_REFUND_NOW,
    });
    expect(audits).toEqual([]);
    expect(events).toEqual([]);
  });

  it('does not let the maker bypass separation by retrying break-glass after completion', async () => {
    const completed = manualRefundOperation({
      ...submitted(),
      status: 'completed',
      version: 4,
      completedAt: MANUAL_REFUND_NOW,
      breakGlassByUserId: MANUAL_REFUND_CHECKER_ID,
      breakGlassReason: 'Incident commander approved emergency',
      breakGlassAuthenticatedAt: new Date('2026-09-04T12:58:00Z'),
      breakGlassAt: MANUAL_REFUND_NOW,
    });
    const { useCase } = harness(new Date('2026-09-04T12:58:00Z'), completed);

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        {
          expectedVersion: 4,
          reason: 'Incident commander approved emergency',
          confirmation: 'BREAK_GLASS',
        },
        { userId: MANUAL_REFUND_MAKER_ID, sessionId: 'session-1', ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(ManualRefundMakerCannotApproveOwnTransfer);
  });
});
