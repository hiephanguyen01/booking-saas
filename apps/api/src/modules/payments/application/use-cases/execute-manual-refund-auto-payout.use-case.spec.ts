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
import {
  ManualRefundAutoPayoutFailed,
  ManualRefundDestinationRequired,
  ManualRefundWorkflowPaused,
} from '../../domain/errors/manual-refund-errors';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import type { ManualRefundPiiCryptoPort } from '../../domain/ports/manual-refund-pii-crypto.port';
import type { IPayoutGatewayPort } from '../../domain/ports/payout-gateway.port';
import type { IRefundBatchRepository } from '../../domain/ports/refund-batch-repository.port';
import type { IRefundRepository } from '../../domain/ports/refund-repository.port';
import { ExecuteManualRefundAutoPayoutUseCase } from './execute-manual-refund-auto-payout.use-case';

const readyWithDestination = () =>
  manualRefundOperation({
    status: 'ready_for_transfer',
    destinationSubmittedAt: MANUAL_REFUND_NOW,
    destinationBankCode: 'MB',
    destinationAccountName: 'NGUYEN HA HIEP',
    destinationAccountCiphertext: 'cipher-bytes',
    destinationEncryptionKeyVersion: 'v1',
  });

describe('ExecuteManualRefundAutoPayoutUseCase', () => {
  it('disburses via payout gateway, completes operation and emits refund.completed', async () => {
    const events: unknown[] = [];
    const calls: string[] = [];
    const tx = fakeTx({
      outboxEvent: {
        create: (args: unknown) => {
          events.push(args);
          return Promise.resolve({});
        },
      },
    });
    const tenantDb = fakeTenantDb({ tx });

    const operationRecord = readyWithDestination();

    const useCase = new ExecuteManualRefundAutoPayoutUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }),
        findById: () => Promise.resolve(operationRecord),
        casUpdate: (_tx, _tenantId, _id, _status, version, patch) => {
          calls.push('operation');
          return Promise.resolve({
            ...operationRecord,
            ...patch,
            version: version + 1,
          });
        },
      }),
      fakePort<IRefundBatchRepository>({
        findById: () =>
          Promise.resolve({
            id: MANUAL_REFUND_BATCH_ID,
            tenantId: MANUAL_REFUND_TENANT_ID,
            bookingId: MANUAL_REFUND_BOOKING_ID,
            requestedAmount: 2000n,
            status: 'processing',
            createdAt: MANUAL_REFUND_NOW,
            updatedAt: MANUAL_REFUND_NOW,
            completedAt: null,
            reason: 'customer_request',
            affectsBookingStatus: true,
          }),
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
      fakePort<IRefundRepository>({
        completeManualBatch: () => {
          calls.push('children');
          return Promise.resolve(1);
        },
      }),
      fakePort<ManualRefundPiiCryptoPort>({
        decryptAccountNumber: () => '0917773564',
      }),
      fakePort<IPayoutGatewayPort>({
        disburse: () =>
          Promise.resolve({
            status: 'succeeded',
            reference: 'FT_AUTO_123456',
            gatewayTxnId: 'TXN_123',
          }),
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
      MANUAL_REFUND_MAKER_ID,
    );

    expect(result.status).toBe('completed');
    expect(calls).toEqual(['operation', 'children', 'batch', 'audit']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      data: expect.objectContaining({
        eventType: 'refund.completed',
        tenantId: MANUAL_REFUND_TENANT_ID,
      }),
    });
  });

  it('rejects when workflow is paused', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new ExecuteManualRefundAutoPayoutUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: true }),
      }),
      fakePort<IRefundBatchRepository>({}),
      fakePort<IRefundRepository>({}),
      fakePort<ManualRefundPiiCryptoPort>({}),
      fakePort<IPayoutGatewayPort>({}),
      fakePort<IAuditWriter>({}),
      new OutboxService(),
      tenantDb.service,
    );

    await expect(
      useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_MAKER_ID),
    ).rejects.toBeInstanceOf(ManualRefundWorkflowPaused);
  });

  it('rejects when destination is missing', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new ExecuteManualRefundAutoPayoutUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }),
        findById: () =>
          Promise.resolve(
            manualRefundOperation({
              status: 'ready_for_transfer',
              destinationBankCode: null,
            }),
          ),
      }),
      fakePort<IRefundBatchRepository>({}),
      fakePort<IRefundRepository>({}),
      fakePort<ManualRefundPiiCryptoPort>({}),
      fakePort<IPayoutGatewayPort>({}),
      fakePort<IAuditWriter>({}),
      new OutboxService(),
      tenantDb.service,
    );

    await expect(
      useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_MAKER_ID),
    ).rejects.toBeInstanceOf(ManualRefundDestinationRequired);
  });

  it('rejects when payout gateway disburse fails', async () => {
    const tenantDb = fakeTenantDb();
    const operationRecord = readyWithDestination();

    const useCase = new ExecuteManualRefundAutoPayoutUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }),
        findById: () => Promise.resolve(operationRecord),
      }),
      fakePort<IRefundBatchRepository>({
        findById: () =>
          Promise.resolve({
            id: MANUAL_REFUND_BATCH_ID,
            tenantId: MANUAL_REFUND_TENANT_ID,
            bookingId: MANUAL_REFUND_BOOKING_ID,
            requestedAmount: 2000n,
            status: 'processing',
            createdAt: MANUAL_REFUND_NOW,
            updatedAt: MANUAL_REFUND_NOW,
            completedAt: null,
            reason: 'customer_request',
            affectsBookingStatus: true,
          }),
      }),
      fakePort<IRefundRepository>({}),
      fakePort<ManualRefundPiiCryptoPort>({
        decryptAccountNumber: () => '0917773564',
      }),
      fakePort<IPayoutGatewayPort>({
        disburse: () =>
          Promise.resolve({
            status: 'failed',
            reference: '',
            failureReason: 'Số dư tài khoản ví không đủ',
          }),
      }),
      fakePort<IAuditWriter>({}),
      new OutboxService(),
      tenantDb.service,
    );

    await expect(
      useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_MAKER_ID),
    ).rejects.toBeInstanceOf(ManualRefundAutoPayoutFailed);
  });
});
