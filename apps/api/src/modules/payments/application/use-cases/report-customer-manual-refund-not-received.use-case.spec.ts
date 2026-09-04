import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ManualRefundConcurrentUpdate } from '../../domain/errors/manual-refund-errors';
import type {
  IManualRefundOperationRepository,
  ManualRefundOperationRecord,
} from '../../domain/ports/manual-refund-operation-repository.port';
import type {
  IRefundBatchRepository,
  RefundBatchRecord,
} from '../../domain/ports/refund-batch-repository.port';
import { ReportCustomerManualRefundNotReceivedUseCase } from './report-customer-manual-refund-not-received.use-case';

const NOW = new Date('2026-09-04T12:00:00.000Z');
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '44444444-4444-4444-8444-444444444444';

const current = {
  id: OPERATION_ID,
  tenantId: TENANT_ID,
  refundBatchId: BATCH_ID,
  status: 'completed',
  version: 7,
  destinationBankCode: 'VCB',
  destinationAccountName: 'NGUYEN VAN AN',
  destinationAccountLast4: '4567',
  destinationIsThirdParty: false,
  destinationConsentAt: null,
  verificationResult: 'matched',
  transferDueAt: null,
  transferSubmittedAt: NOW,
  completedAt: NOW,
  customerAcknowledgement: null,
  customerAcknowledgedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
} as ManualRefundOperationRecord;

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

describe('ReportCustomerManualRefundNotReceivedUseCase', () => {
  it('records a not-received report as follow-up without changing completion', async () => {
    const patches: unknown[] = [];
    const tenantDb = fakeTenantDb({ now: NOW });
    const useCase = new ReportCustomerManualRefundNotReceivedUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: () => Promise.resolve(current),
        casUpdate: (_tx, _tenantId, _id, _status, _version, patch) => {
          patches.push(patch);
          return Promise.resolve({ ...current, ...patch, version: 8 });
        },
      }),
      fakePort<IRefundBatchRepository>({ findById: () => Promise.resolve(batch) }),
      tenantDb.service,
    );

    const result = await useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, {
      acknowledgement: 'not_received',
      note: 'Checked account at noon',
      expectedVersion: 7,
    });

    expect(patches).toEqual([
      {
        customerAcknowledgement: 'not_received',
        customerAcknowledgedAt: NOW,
        customerAcknowledgementNote: 'Checked account at noon',
      },
    ]);
    expect(result).toMatchObject({
      status: 'completed',
      customerAcknowledgement: 'not_received',
      version: 8,
    });
  });

  it('rejects a stale replay before writing', async () => {
    const tenantDb = fakeTenantDb({ now: NOW });
    const useCase = new ReportCustomerManualRefundNotReceivedUseCase(
      fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current) }),
      fakePort<IRefundBatchRepository>({ findById: () => Promise.resolve(batch) }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, {
        acknowledgement: 'not_received',
        expectedVersion: 6,
      }),
    ).rejects.toBeInstanceOf(ManualRefundConcurrentUpdate);
  });
});
