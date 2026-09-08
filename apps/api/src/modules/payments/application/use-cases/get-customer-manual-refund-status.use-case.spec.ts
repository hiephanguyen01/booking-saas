import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import type {
  IManualRefundOperationRepository,
  ManualRefundOperationRecord,
} from '../../domain/ports/manual-refund-operation-repository.port';
import type {
  IRefundBatchRepository,
  RefundBatchRecord,
} from '../../domain/ports/refund-batch-repository.port';
import { GetCustomerManualRefundStatusUseCase } from './get-customer-manual-refund-status.use-case';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '44444444-4444-4444-8444-444444444444';

function operation(): ManualRefundOperationRecord {
  return {
    id: OPERATION_ID,
    tenantId: TENANT_ID,
    refundBatchId: BATCH_ID,
    status: 'ready_for_transfer',
    version: 3,
    destinationBankCode: 'VCB',
    destinationAccountName: 'NGUYEN VAN AN',
    destinationAccountLast4: '4567',
    destinationAccountCiphertext: 'ciphertext-that-must-never-leak',
    destinationEncryptionKeyVersion: 'v1',
    destinationAccountFingerprint: 'fingerprint-that-must-never-leak',
    destinationIsThirdParty: false,
    destinationConsentAt: null,
    destinationSubmittedAt: new Date('2026-09-04T09:00:00.000Z'),
    verificationResult: 'matched',
    verificationMethod: 'lookup',
    verifiedByUserId: null,
    verifiedAt: new Date('2026-09-04T09:00:00.000Z'),
    makerUserId: null,
    claimedAt: null,
    reassignedByUserId: null,
    reassignmentReason: null,
    reassignedAt: null,
    transferReference: null,
    transferReferenceNormalized: null,
    evidenceObjectKey: null,
    evidenceContentType: null,
    evidenceSizeBytes: null,
    evidenceSha256: null,
    evidenceVerifiedAt: null,
    transferSubmittedByUserId: null,
    transferSubmittedAt: null,
    checkedByUserId: null,
    checkedAt: null,
    rejectionReason: null,
    reopenedByUserId: null,
    reopenReason: null,
    reopenedAt: null,
    readyAt: new Date('2026-09-04T09:00:00.000Z'),
    transferDueAt: null,
    completedAt: null,
    customerAcknowledgement: null,
    customerAcknowledgedAt: null,
    customerAcknowledgementNote: null,
    ciphertextPurgedAt: null,
    breakGlassByUserId: null,
    breakGlassReason: null,
    breakGlassAuthenticatedAt: null,
    breakGlassAt: null,
    createdAt: new Date('2026-09-04T08:00:00.000Z'),
    updatedAt: new Date('2026-09-04T09:00:00.000Z'),
  };
}

function batch(overrides: Partial<RefundBatchRecord> = {}): RefundBatchRecord {
  return {
    id: BATCH_ID,
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    requestedAmount: 1250000n,
    reason: 'booking_cancellation',
    affectsBookingStatus: true,
    status: 'manual_required',
    completedAt: null,
    ...overrides,
  };
}

describe('GetCustomerManualRefundStatusUseCase', () => {
  it('returns only a booking-scoped masked customer view inside one tenant transaction', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new GetCustomerManualRefundStatusUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: (_tx, tenantId, id) => {
          expect({ tenantId, id }).toEqual({ tenantId: TENANT_ID, id: OPERATION_ID });
          return Promise.resolve(operation());
        },
      }),
      fakePort<IRefundBatchRepository>({ findById: () => Promise.resolve(batch()) }),
      tenantDb.service,
    );

    const result = await useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toEqual({
      id: OPERATION_ID,
      refundBatchId: BATCH_ID,
      bookingId: BOOKING_ID,
      bookingCode: 'BK-0001',
      amount: '1250000',
      status: 'ready_for_transfer',
      version: 3,
      destinationLocked: false,
      destination: {
        bankCode: 'VCB',
        accountNameMasked: 'N••••• V•• A•',
        accountNumberLast4: '4567',
        isThirdParty: false,
        consentRecordedAt: null,
      },
      verificationResult: 'matched',
      transferDueAt: null,
      customerDetailsDueAt: null,
      transferSubmittedAt: null,
      completedAt: null,
      customerAcknowledgement: null,
      customerAcknowledgedAt: null,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('ciphertext-that-must-never-leak');
    expect(serialized).not.toContain('fingerprint-that-must-never-leak');
    expect(serialized).not.toContain('NGUYEN VAN AN');
  });

  it('hides an operation whose batch belongs to another booking', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new GetCustomerManualRefundStatusUseCase(
      fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(operation()) }),
      fakePort<IRefundBatchRepository>({
        findById: () => Promise.resolve(batch({ bookingId: 'another-booking' })),
      }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID),
    ).rejects.toBeInstanceOf(ManualRefundOperationNotFound);
  });

  it('rejects a repository record from another tenant even if its batch matches', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new GetCustomerManualRefundStatusUseCase(
      fakePort<IManualRefundOperationRepository>({
        findById: () => Promise.resolve({ ...operation(), tenantId: 'another-tenant' }),
      }),
      fakePort<IRefundBatchRepository>({ findById: () => Promise.resolve(batch()) }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID),
    ).rejects.toBeInstanceOf(ManualRefundOperationNotFound);
  });
});
