import { describe, expect, it } from 'vitest';
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
  manualRefundUpload,
} from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ManualRefundEvidenceRequired, ManualRefundMakerCannotApproveOwnTransfer } from '../../domain/errors/manual-refund-errors';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import type { IRefundBatchRepository } from '../../domain/ports/refund-batch-repository.port';
import type { IRefundRepository } from '../../domain/ports/refund-repository.port';
import type { IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import { ApproveManualRefundUseCase } from './approve-manual-refund.use-case';

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

describe('ApproveManualRefundUseCase', () => {
  it('atomically completes operation, manual children, batch, audit, and one batch event', async () => {
    const calls: string[] = [];
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
    const current = submitted();
    const useCase = new ApproveManualRefundUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: () => Promise.resolve(current),
        casUpdate: (_tx, tenantId, id, status, version, patch) => {
          expect({ tenantId, id, status, version, patch }).toEqual({
            tenantId: MANUAL_REFUND_TENANT_ID,
            id: MANUAL_REFUND_OPERATION_ID,
            status: 'transfer_submitted',
            version: 3,
            patch: {
              status: 'completed',
              checkedByUserId: MANUAL_REFUND_CHECKER_ID,
              checkedAt: MANUAL_REFUND_NOW,
              completedAt: MANUAL_REFUND_NOW,
            },
          });
          calls.push('operation');
          return Promise.resolve({
            ...current,
            ...patch,
            status: 'completed',
            version: 4,
          });
        },
      }),
      fakePort<IRefundRepository>({
        completeManualBatch: (_tx, tenantId, batchId, completedAt, reference) => {
          expect({ tenantId, batchId, completedAt, reference }).toEqual({
            tenantId: MANUAL_REFUND_TENANT_ID,
            batchId: MANUAL_REFUND_BATCH_ID,
            completedAt: MANUAL_REFUND_NOW,
            reference: 'VCB-001',
          });
          calls.push('children');
          return Promise.resolve(2);
        },
      }),
      fakePort<IRefundBatchRepository>({
        refreshStatus: () => {
          calls.push('batch');
          return Promise.resolve({
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
          });
        },
      }),
      fakePort<IManualRefundEvidenceRepository>({ findUpload: () => Promise.resolve({ ...manualRefundUpload(), objectKey: 'private/receipt.pdf', status: 'claimed', sizeBytes: 12 }) }),
      fakePort<StoragePort>({ inspectPrivateFile: () => Promise.resolve({ valid: true, checksum: 'b'.repeat(64), sizeBytes: 12, contentType: 'application/pdf' }) }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          expect(JSON.stringify(entry)).not.toContain('secret-ciphertext');
          calls.push('audit');
          return Promise.resolve();
        },
      }),
      new OutboxService(),
      tenantDb.service,
    );
    const result = await useCase.execute(
      MANUAL_REFUND_TENANT_ID,
      MANUAL_REFUND_OPERATION_ID,
      { expectedVersion: 3 },
      MANUAL_REFUND_CHECKER_ID,
    );
    expect(calls).toEqual(['operation', 'children', 'batch', 'audit']);
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
    expect(JSON.stringify(events)).not.toContain('secret-ciphertext');
    expect(result).toEqual({
      id: MANUAL_REFUND_OPERATION_ID,
      status: 'completed',
      version: 4,
      completedAt: MANUAL_REFUND_NOW,
    });
  });

  it('rejects maker self-approval before any completion write', async () => {
    const useCase = new ApproveManualRefundUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: () => Promise.resolve(submitted()),
      }),
      fakePort<IRefundRepository>({}),
      fakePort<IRefundBatchRepository>({}),
      fakePort<IManualRefundEvidenceRepository>({}),
      fakePort<StoragePort>({}),
      fakePort<IAuditWriter>({}),
      new OutboxService(),
      fakeTenantDb().service,
    );
    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        { expectedVersion: 3 },
        MANUAL_REFUND_MAKER_ID,
      ),
    ).rejects.toBeInstanceOf(ManualRefundMakerCannotApproveOwnTransfer);
  });

  it('treats a repeated approval of a completed operation as idempotent', async () => {
    const current = manualRefundOperation({
      ...submitted(),
      status: 'completed',
      version: 4,
      checkedByUserId: MANUAL_REFUND_CHECKER_ID,
      checkedAt: MANUAL_REFUND_NOW,
      completedAt: MANUAL_REFUND_NOW,
    });
    const useCase = new ApproveManualRefundUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: () => Promise.resolve(current),
      }),
      fakePort<IRefundRepository>({}),
      fakePort<IRefundBatchRepository>({}),
      fakePort<IManualRefundEvidenceRepository>({}),
      fakePort<StoragePort>({}),
      fakePort<IAuditWriter>({}),
      new OutboxService(),
      fakeTenantDb().service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        { expectedVersion: 4 },
        MANUAL_REFUND_CHECKER_ID,
      ),
    ).resolves.toEqual({
      id: MANUAL_REFUND_OPERATION_ID,
      status: 'completed',
      version: 4,
      completedAt: MANUAL_REFUND_NOW,
    });
  });

  it('does not let the maker bypass separation by retrying an already completed approval', async () => {
    const current = manualRefundOperation({
      ...submitted(),
      status: 'completed',
      version: 4,
      checkedByUserId: MANUAL_REFUND_CHECKER_ID,
      checkedAt: MANUAL_REFUND_NOW,
      completedAt: MANUAL_REFUND_NOW,
    });
    const useCase = new ApproveManualRefundUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: () => Promise.resolve(current),
      }),
      fakePort<IRefundRepository>({}),
      fakePort<IRefundBatchRepository>({}),
      fakePort<IManualRefundEvidenceRepository>({}),
      fakePort<StoragePort>({}),
      fakePort<IAuditWriter>({}),
      new OutboxService(),
      fakeTenantDb().service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        { expectedVersion: 4 },
        MANUAL_REFUND_MAKER_ID,
      ),
    ).rejects.toBeInstanceOf(ManualRefundMakerCannotApproveOwnTransfer);
  });

  it('blocks completion when the claimed evidence record is missing', async () => {
    const useCase = new ApproveManualRefundUseCase(
      fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(submitted()) }),
      fakePort<IRefundRepository>({}),
      fakePort<IRefundBatchRepository>({}),
      fakePort<IManualRefundEvidenceRepository>({ findUpload: () => Promise.resolve(null) }),
      fakePort<StoragePort>({}),
      fakePort<IAuditWriter>({}),
      new OutboxService(),
      fakeTenantDb().service,
    );
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3 }, MANUAL_REFUND_CHECKER_ID)).rejects.toBeInstanceOf(ManualRefundEvidenceRequired);
  });

  it('retires mutated claimed evidence before returning the validation error', async () => {
    let retired = false;
    const quarantined: string[] = [];
    const current = submitted();
    const useCase = new ApproveManualRefundUseCase(
      fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current) }),
      fakePort<IRefundRepository>({}),
      fakePort<IRefundBatchRepository>({}),
      fakePort<IManualRefundEvidenceRepository>({
        findUpload: () => Promise.resolve({ ...manualRefundUpload(), objectKey: current.evidenceObjectKey as string, status: 'claimed', checksum: 'c'.repeat(64), sizeBytes: 12 }),
        quarantineUpload: () => { retired = true; return Promise.resolve(true); },
      }),
      fakePort<StoragePort>({ quarantinePrivateObject: (key) => { quarantined.push(key); return Promise.reject(new Error('storage unavailable')); } }),
      fakePort<IAuditWriter>({}),
      new OutboxService(),
      fakeTenantDb().service,
    );
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3 }, MANUAL_REFUND_CHECKER_ID)).rejects.toBeInstanceOf(ManualRefundEvidenceRequired);
    expect(retired).toBe(true);
    expect(quarantined).toEqual([current.evidenceObjectKey]);
  });
});
