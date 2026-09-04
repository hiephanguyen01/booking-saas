import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx, MANUAL_REFUND_BATCH_ID, MANUAL_REFUND_CHECKER_ID, MANUAL_REFUND_MAKER_ID, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { ISessionStore } from '../../../identity-access/domain/ports/session-store.port';
import { ManualRefundFreshAuthenticationRequired } from '../../domain/errors/manual-refund-errors';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import type { IRefundBatchRepository } from '../../domain/ports/refund-batch-repository.port';
import type { IRefundRepository } from '../../domain/ports/refund-repository.port';
import { BreakGlassCompleteManualRefundUseCase } from './break-glass-complete-manual-refund.use-case';

const submitted = () => manualRefundOperation({ status: 'transfer_submitted', transferReference: 'VCB-001', evidenceObjectKey: 'private/receipt.pdf', evidenceContentType: 'application/pdf', evidenceSizeBytes: 12, evidenceSha256: 'b'.repeat(64), evidenceVerifiedAt: MANUAL_REFUND_NOW, transferSubmittedByUserId: MANUAL_REFUND_MAKER_ID, transferSubmittedAt: MANUAL_REFUND_NOW });

function harness(authenticatedAt: Date | null) {
  const audits: unknown[] = []; const events: unknown[] = []; const tx = fakeTx({ outboxEvent: { create: (args: unknown) => { events.push(args); return Promise.resolve({}); } } }); const tenantDb = fakeTenantDb({ tx, now: MANUAL_REFUND_NOW }); const current = submitted();
  const useCase = new BreakGlassCompleteManualRefundUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => Promise.resolve({ ...current, ...patch, version: 4 }) }), fakePort<IRefundRepository>({ completeManualBatch: () => Promise.resolve(2) }), fakePort<IRefundBatchRepository>({ refreshStatus: () => Promise.resolve({ transitionedToCompleted: true, batch: { id: MANUAL_REFUND_BATCH_ID, tenantId: MANUAL_REFUND_TENANT_ID, bookingId: '22222222-2222-4222-8222-222222222222', requestedAmount: 1_250_000n, reason: 'booking_cancellation', affectsBookingStatus: true, status: 'completed', completedAt: MANUAL_REFUND_NOW } }) }), fakePort<IAuditWriter>({ write: (_tx, entry) => { audits.push(entry); return Promise.resolve(); } }), fakePort<ISessionStore>({ authenticationTime: () => Promise.resolve(authenticatedAt) }), new OutboxService(), tenantDb.service);
  return { useCase, audits, events, tenantDb };
}

describe('BreakGlassCompleteManualRefundUseCase', () => {
  it('requires authentication within five minutes before opening the tenant transaction', async () => {
    const { useCase, tenantDb } = harness(new Date('2026-09-04T12:50:00Z'));
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, reason: 'Incident commander approved emergency', confirmation: 'BREAK_GLASS' }, { userId: MANUAL_REFUND_CHECKER_ID, sessionId: 'session-1', ip: '127.0.0.1' })).rejects.toBeInstanceOf(ManualRefundFreshAuthenticationRequired);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('completes atomically and writes a high-severity audit with one batch event', async () => {
    const { useCase, audits, events } = harness(new Date('2026-09-04T12:58:00Z'));
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, reason: 'Incident commander approved emergency', confirmation: 'BREAK_GLASS' }, { userId: MANUAL_REFUND_CHECKER_ID, sessionId: 'session-1', ip: '127.0.0.1' });
    expect(audits[0]).toMatchObject({ tenantId: MANUAL_REFUND_TENANT_ID, action: 'manual_refund.break_glass_completed', actorUserId: MANUAL_REFUND_CHECKER_ID, ip: '127.0.0.1', data: { severity: 'high', reason: 'Incident commander approved emergency' } });
    expect(events).toHaveLength(1);
  });
});
