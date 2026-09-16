import { describe, expect, it } from 'vitest';
import {
  fakePort,
  fakeTenantDb,
  fakeTx,
  MANUAL_REFUND_BATCH_ID,
  MANUAL_REFUND_BOOKING_ID,
  MANUAL_REFUND_MAKER_ID,
  MANUAL_REFUND_NOW,
  MANUAL_REFUND_OPERATION_ID,
  MANUAL_REFUND_TENANT_ID,
  manualRefundOperation,
} from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import type { IRefundBatchRepository } from '../../domain/ports/refund-batch-repository.port';
import type { IRefundRepository } from '../../domain/ports/refund-repository.port';
import { CompleteManualRefundTransferUseCase } from './complete-manual-refund-transfer.use-case';

const readyForTransfer = () =>
  manualRefundOperation({
    status: 'ready_for_transfer',
    destinationSubmittedAt: MANUAL_REFUND_NOW,
  });

describe('CompleteManualRefundTransferUseCase', () => {
  it('atomically completes operation, batch, children, and emits refund.completed in 1 step', async () => {
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
    const current = readyForTransfer();

    const useCase = new CompleteManualRefundTransferUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }),
        findById: () => Promise.resolve(current),
        casUpdate: (_tx, tenantId, id, status, version, patch) => {
          expect({ tenantId, id, status, version, patch }).toEqual({
            tenantId: MANUAL_REFUND_TENANT_ID,
            id: MANUAL_REFUND_OPERATION_ID,
            status: 'ready_for_transfer',
            version: 3,
            patch: {
              status: 'completed',
              makerUserId: MANUAL_REFUND_MAKER_ID,
              transferSubmittedByUserId: MANUAL_REFUND_MAKER_ID,
              transferSubmittedAt: MANUAL_REFUND_NOW,
              transferReference: 'FT_MB_12345',
              checkedByUserId: MANUAL_REFUND_MAKER_ID,
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
            reference: 'FT_MB_12345',
          });
          calls.push('children');
          return Promise.resolve(1);
        },
      }),
      fakePort<IRefundBatchRepository>({
        refreshStatus: () => {
          calls.push('batch');
          return Promise.resolve({
            batch: {
              id: MANUAL_REFUND_BATCH_ID,
              tenantId: MANUAL_REFUND_TENANT_ID,
              bookingId: MANUAL_REFUND_BOOKING_ID,
              requestedAmount: 2000n,
              reason: 'customer_request',
              affectsBookingStatus: true,
              status: 'completed',
              completedAt: MANUAL_REFUND_NOW,
              createdAt: MANUAL_REFUND_NOW,
              updatedAt: MANUAL_REFUND_NOW,
            },
            transitionedToCompleted: true,
          });
        },
      }),
      fakePort<IAuditWriter>({
        write: () => {
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
      { expectedVersion: 3, reference: 'FT_MB_12345' },
      MANUAL_REFUND_MAKER_ID,
    );

    expect(result).toEqual({
      id: MANUAL_REFUND_OPERATION_ID,
      status: 'completed',
      version: 4,
      completedAt: MANUAL_REFUND_NOW,
    });
    expect(calls).toEqual(['operation', 'children', 'batch', 'audit']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      data: expect.objectContaining({
        eventType: 'refund.completed',
        tenantId: MANUAL_REFUND_TENANT_ID,
      }),
    });
  });
});
