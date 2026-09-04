import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx, MANUAL_REFUND_BATCH_ID, MANUAL_REFUND_CHECKER_ID, MANUAL_REFUND_MAKER_ID, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ManualRefundMakerCannotApproveOwnTransfer } from '../../domain/errors/manual-refund-errors';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import type { IRefundBatchRepository } from '../../domain/ports/refund-batch-repository.port';
import type { IRefundRepository } from '../../domain/ports/refund-repository.port';
import { ApproveManualRefundUseCase } from './approve-manual-refund.use-case';

const submitted = () => manualRefundOperation({ status: 'transfer_submitted', transferReference: 'VCB-001', evidenceObjectKey: 'private/receipt.pdf', evidenceContentType: 'application/pdf', evidenceSizeBytes: 12, evidenceSha256: 'b'.repeat(64), evidenceVerifiedAt: MANUAL_REFUND_NOW, transferSubmittedByUserId: MANUAL_REFUND_MAKER_ID, transferSubmittedAt: MANUAL_REFUND_NOW });

describe('ApproveManualRefundUseCase', () => {
  it('atomically completes operation, manual children, batch, audit, and one batch event', async () => {
    const calls: string[] = []; const events: unknown[] = []; const tx = fakeTx({ outboxEvent: { create: (args: unknown) => { events.push(args); return Promise.resolve({}); } } }); const tenantDb = fakeTenantDb({ tx, now: MANUAL_REFUND_NOW }); const current = submitted();
    const useCase = new ApproveManualRefundUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: () => { calls.push('operation'); return Promise.resolve({ ...current, status: 'completed', version: 4, completedAt: MANUAL_REFUND_NOW }); } }), fakePort<IRefundRepository>({ completeManualBatch: () => { calls.push('children'); return Promise.resolve(2); } }), fakePort<IRefundBatchRepository>({ refreshStatus: () => { calls.push('batch'); return Promise.resolve({ transitionedToCompleted: true, batch: { id: MANUAL_REFUND_BATCH_ID, tenantId: MANUAL_REFUND_TENANT_ID, bookingId: '22222222-2222-4222-8222-222222222222', requestedAmount: 1_250_000n, reason: 'booking_cancellation', affectsBookingStatus: true, status: 'completed', completedAt: MANUAL_REFUND_NOW } }); } }), fakePort<IAuditWriter>({ write: () => { calls.push('audit'); return Promise.resolve(); } }), new OutboxService(), tenantDb.service);
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3 }, MANUAL_REFUND_CHECKER_ID);
    expect(calls).toEqual(['operation', 'children', 'batch', 'audit']);
    expect(events).toHaveLength(1);
  });

  it('rejects maker self-approval before any completion write', async () => {
    const useCase = new ApproveManualRefundUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(submitted()) }), fakePort<IRefundRepository>({}), fakePort<IRefundBatchRepository>({}), fakePort<IAuditWriter>({}), new OutboxService(), fakeTenantDb().service);
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3 }, MANUAL_REFUND_MAKER_ID)).rejects.toBeInstanceOf(ManualRefundMakerCannotApproveOwnTransfer);
  });
});
