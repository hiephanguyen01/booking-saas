import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ManualRefundInvalidTransition } from '../../domain/errors/manual-refund-errors';
import type {
  IManualRefundOperationRepository,
  ManualRefundOperationRecord,
} from '../../domain/ports/manual-refund-operation-repository.port';
import type {
  IRefundBatchRepository,
  RefundBatchRecord,
} from '../../domain/ports/refund-batch-repository.port';
import { AcknowledgeCustomerManualRefundReceivedUseCase } from './acknowledge-customer-manual-refund-received.use-case';

const NOW = new Date('2026-09-04T11:00:00.000Z');
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '44444444-4444-4444-8444-444444444444';

const record = (status: ManualRefundOperationRecord['status']): ManualRefundOperationRecord =>
  ({
    id: OPERATION_ID,
    tenantId: TENANT_ID,
    refundBatchId: BATCH_ID,
    status,
    version: 5,
    destinationBankCode: 'VCB',
    destinationAccountName: 'NGUYEN VAN AN',
    destinationAccountLast4: '4567',
    destinationIsThirdParty: false,
    destinationConsentAt: null,
    verificationResult: 'matched',
    transferDueAt: null,
    transferSubmittedAt: NOW,
    completedAt: status === 'completed' ? NOW : null,
    customerAcknowledgement: null,
    customerAcknowledgedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }) as ManualRefundOperationRecord;

const batch: RefundBatchRecord = {
  id: BATCH_ID,
  tenantId: TENANT_ID,
  bookingId: BOOKING_ID,
  requestedAmount: 1250000n,
  reason: 'booking_cancellation',
  affectsBookingStatus: true,
  status: 'completed',
  completedAt: NOW,
};

describe('AcknowledgeCustomerManualRefundReceivedUseCase', () => {
  it('records received follow-up with DB time after completion', async () => {
    const patches: unknown[] = [];
    const tenantDb = fakeTenantDb({ now: NOW });
    const current = record('completed');
    const useCase = new AcknowledgeCustomerManualRefundReceivedUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: () => Promise.resolve(current),
        casUpdate: (_tx, _tenantId, _id, _status, _version, patch) => {
          patches.push(patch);
          return Promise.resolve({ ...current, ...patch, version: 6 });
        },
      }),
      fakePort<IRefundBatchRepository>({ findById: () => Promise.resolve(batch) }),
      tenantDb.service,
    );

    const result = await useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, {
      acknowledgement: 'received',
      note: 'Funds arrived',
      expectedVersion: 5,
    });

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(patches).toEqual([
      {
        customerAcknowledgement: 'received',
        customerAcknowledgedAt: NOW,
        customerAcknowledgementNote: 'Funds arrived',
      },
    ]);
    expect(result).toMatchObject({ customerAcknowledgement: 'received', version: 6 });
  });

  it('does not let a customer acknowledge an unfinished transfer', async () => {
    const tenantDb = fakeTenantDb({ now: NOW });
    const useCase = new AcknowledgeCustomerManualRefundReceivedUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: () => Promise.resolve(record('transfer_submitted')),
      }),
      fakePort<IRefundBatchRepository>({ findById: () => Promise.resolve(batch) }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, {
        acknowledgement: 'received',
        expectedVersion: 5,
      }),
    ).rejects.toBeInstanceOf(ManualRefundInvalidTransition);
  });
});
