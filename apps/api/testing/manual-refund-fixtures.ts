import type {
  ManualRefundOperationRecord,
  ManualRefundOperationViewRecord,
} from '../src/modules/payments/domain/ports/manual-refund-operation-repository.port';
import type { ManualRefundEvidenceUploadRecord } from '../src/modules/payments/domain/ports/manual-refund-evidence-repository.port';

export const MANUAL_REFUND_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const MANUAL_REFUND_BOOKING_ID = '22222222-2222-4222-8222-222222222222';
export const MANUAL_REFUND_BATCH_ID = '33333333-3333-4333-8333-333333333333';
export const MANUAL_REFUND_OPERATION_ID = '44444444-4444-4444-8444-444444444444';
export const MANUAL_REFUND_MAKER_ID = '55555555-5555-4555-8555-555555555555';
export const MANUAL_REFUND_CHECKER_ID = '66666666-6666-4666-8666-666666666666';
export const MANUAL_REFUND_NOW = new Date('2026-09-04T13:00:00.000Z');

export function manualRefundOperation(
  overrides: Partial<ManualRefundOperationRecord> = {},
): ManualRefundOperationRecord {
  return {
    id: MANUAL_REFUND_OPERATION_ID,
    tenantId: MANUAL_REFUND_TENANT_ID,
    refundBatchId: MANUAL_REFUND_BATCH_ID,
    status: 'ready_for_transfer',
    version: 3,
    destinationBankCode: 'VCB',
    destinationAccountName: 'NGUYEN VAN AN',
    destinationAccountLast4: '4567',
    destinationAccountCiphertext: 'secret-ciphertext',
    destinationEncryptionKeyVersion: 'v1',
    destinationAccountFingerprint: 'a'.repeat(64),
    destinationIsThirdParty: false,
    destinationConsentAt: null,
    destinationSubmittedAt: new Date('2026-09-04T09:00:00.000Z'),
    verificationResult: 'matched',
    verificationMethod: 'lookup',
    verifiedByUserId: null,
    verifiedAt: new Date('2026-09-04T09:00:00.000Z'),
    makerUserId: MANUAL_REFUND_MAKER_ID,
    claimedAt: new Date('2026-09-04T10:00:00.000Z'),
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
    updatedAt: new Date('2026-09-04T10:00:00.000Z'),
    ...overrides,
  };
}

export function manualRefundView(
  overrides: Partial<ManualRefundOperationRecord> = {},
): ManualRefundOperationViewRecord {
  return {
    operation: manualRefundOperation(overrides),
    bookingId: MANUAL_REFUND_BOOKING_ID,
    bookingCode: 'BK-0001',
    requestedAmount: 1_250_000n,
  };
}

export function manualRefundUpload(
  overrides: Partial<ManualRefundEvidenceUploadRecord> = {},
): ManualRefundEvidenceUploadRecord {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    tenantId: MANUAL_REFUND_TENANT_ID,
    operationId: MANUAL_REFUND_OPERATION_ID,
    objectKey: `manual-refund-evidence/${MANUAL_REFUND_TENANT_ID}/${MANUAL_REFUND_OPERATION_ID}/receipt.pdf`,
    checksum: 'b'.repeat(64),
    sizeBytes: 12_345,
    contentType: 'application/pdf',
    status: 'pending',
    expiresAt: new Date('2026-09-05T13:00:00.000Z'),
    claimedAt: null,
    quarantinedAt: null,
    createdAt: MANUAL_REFUND_NOW,
    ...overrides,
  };
}
