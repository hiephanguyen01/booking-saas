import type {
  ManualRefundDetailResponse,
  ManualRefundListItem,
  ManualRefundPrivateDetailsResponse,
  ManualRefundStatusResponse,
} from '@booking/contracts';
import { ManualRefundOperation } from '../domain/entities/manual-refund-operation.entity';
import type { ManualRefundOperationRecord } from '../domain/ports/manual-refund-operation-repository.port';
import type { RefundBatchRecord } from '../domain/ports/refund-batch-repository.port';

export function toManualRefundOperation(
  record: ManualRefundOperationRecord,
): ManualRefundOperation {
  return ManualRefundOperation.rehydrate({
    id: record.id,
    status: record.status,
    version: record.version,
    destinationSubmittedAt: record.destinationSubmittedAt,
    makerUserId: record.makerUserId,
    claimedAt: record.claimedAt,
    transferReference: record.transferReference,
    evidenceObjectKey: record.evidenceObjectKey,
    evidenceContentType: record.evidenceContentType,
    evidenceSizeBytes: record.evidenceSizeBytes,
    evidenceSha256: record.evidenceSha256,
    evidenceVerifiedAt: record.evidenceVerifiedAt,
    transferSubmittedByUserId: record.transferSubmittedByUserId,
    transferSubmittedAt: record.transferSubmittedAt,
    reassignedByUserId: record.reassignedByUserId,
    reassignmentReason: record.reassignmentReason,
    reassignedAt: record.reassignedAt,
    reopenedByUserId: record.reopenedByUserId,
    reopenReason: record.reopenReason,
    reopenedAt: record.reopenedAt,
    breakGlassByUserId: record.breakGlassByUserId,
    breakGlassReason: record.breakGlassReason,
    breakGlassAuthenticatedAt: record.breakGlassAuthenticatedAt,
    breakGlassAt: record.breakGlassAt,
    customerAcknowledgement: record.customerAcknowledgement,
    customerAcknowledgedAt: record.customerAcknowledgedAt,
    customerAcknowledgementNote: record.customerAcknowledgementNote,
  });
}

export function toCustomerManualRefundStatusResponse(
  operation: ManualRefundOperationRecord,
  batch: RefundBatchRecord,
  bookingCode: string,
): ManualRefundStatusResponse {
  const destinationComplete =
    operation.destinationBankCode !== null &&
    operation.destinationAccountName !== null &&
    operation.destinationAccountLast4 !== null;

  return {
    id: operation.id,
    refundBatchId: operation.refundBatchId,
    bookingId: batch.bookingId,
    bookingCode,
    amount: batch.requestedAmount.toString(),
    status: operation.status,
    version: operation.version,
    destination: destinationComplete
      ? {
          bankCode: operation.destinationBankCode as string,
          accountNameMasked: maskAccountName(operation.destinationAccountName as string),
          accountNumberLast4: operation.destinationAccountLast4 as string,
          isThirdParty: operation.destinationIsThirdParty,
          consentRecordedAt: operation.destinationConsentAt?.toISOString() ?? null,
        }
      : null,
    verificationResult: operation.verificationResult,
    transferDueAt: operation.transferDueAt?.toISOString() ?? null,
    transferSubmittedAt: operation.transferSubmittedAt?.toISOString() ?? null,
    completedAt: operation.completedAt?.toISOString() ?? null,
    customerAcknowledgement: operation.customerAcknowledgement,
    customerAcknowledgedAt: operation.customerAcknowledgedAt?.toISOString() ?? null,
  };
}

export function toManualRefundListItem(view: import('../domain/ports/manual-refund-operation-repository.port').ManualRefundOperationViewRecord): ManualRefundListItem {
  const operation = view.operation;
  return {
    ...toCustomerManualRefundStatusResponse(operation, {
      id: operation.refundBatchId,
      tenantId: operation.tenantId,
      bookingId: view.bookingId,
      requestedAmount: view.requestedAmount,
      reason: '',
      affectsBookingStatus: true,
      status: operation.status === 'completed' ? 'completed' : 'manual_required',
      completedAt: operation.completedAt,
    }, view.bookingCode),
    makerUserId: operation.makerUserId,
    claimedAt: operation.claimedAt?.toISOString() ?? null,
    updatedAt: operation.updatedAt.toISOString(),
  };
}

export function toManualRefundDetailResponse(view: import('../domain/ports/manual-refund-operation-repository.port').ManualRefundOperationViewRecord): ManualRefundDetailResponse {
  const operation = view.operation;
  const base = toManualRefundListItem(view);
  return {
    ...base,
    customerAcknowledgement: operation.customerAcknowledgement,
    customerAcknowledgedAt: operation.customerAcknowledgedAt?.toISOString() ?? null,
    transferReference: operation.transferReference,
    transferSubmittedByUserId: operation.transferSubmittedByUserId,
    checkedByUserId: operation.checkedByUserId,
    checkedAt: operation.checkedAt?.toISOString() ?? null,
    rejectionReason: operation.rejectionReason,
    evidence: {
      present: Boolean(operation.evidenceObjectKey),
      contentType: operation.evidenceContentType as 'application/pdf' | 'image/jpeg' | 'image/png' | null,
      sizeBytes: operation.evidenceSizeBytes,
      verifiedAt: operation.evidenceVerifiedAt?.toISOString() ?? null,
    },
    ciphertextPurgedAt: operation.ciphertextPurgedAt?.toISOString() ?? null,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
  };
}

export function toManualRefundPrivateDetailsResponse(input: {
  bankCode: string;
  accountName: string;
  accountNumber: string;
  evidenceDownload: { downloadUrl: string; expiresInSec: number } | null;
}): ManualRefundPrivateDetailsResponse {
  return input;
}

/** Tenant mutation response; persistence-only account/evidence secrets never cross this boundary. */
export function toManualRefundMutationResponse(record: ManualRefundOperationRecord) {
  return {
    id: record.id,
    status: record.status,
    version: record.version,
    destination: record.destinationBankCode && record.destinationAccountName && record.destinationAccountLast4
      ? {
          bankCode: record.destinationBankCode,
          accountNameMasked: maskAccountName(record.destinationAccountName),
          accountNumberLast4: record.destinationAccountLast4,
          isThirdParty: record.destinationIsThirdParty,
          consentRecordedAt: record.destinationConsentAt?.toISOString() ?? null,
        }
      : null,
    verificationResult: record.verificationResult,
    makerUserId: record.makerUserId,
    claimedAt: record.claimedAt?.toISOString() ?? null,
    transferReference: record.transferReference,
    transferSubmittedByUserId: record.transferSubmittedByUserId,
    checkedByUserId: record.checkedByUserId,
    checkedAt: record.checkedAt?.toISOString() ?? null,
    rejectionReason: record.rejectionReason,
    evidence: {
      present: Boolean(record.evidenceObjectKey),
      contentType: record.evidenceContentType,
      sizeBytes: record.evidenceSizeBytes,
      verifiedAt: record.evidenceVerifiedAt?.toISOString() ?? null,
    },
    transferDueAt: record.transferDueAt?.toISOString() ?? null,
    transferSubmittedAt: record.transferSubmittedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
  };
}

function maskAccountName(name: string): string {
  return name
    .trim()
    .split(/(\s+)/u)
    .map((part) => {
      if (/^\s+$/u.test(part)) return part;
      const characters = Array.from(part);
      if (characters.length <= 1) return '•';
      return `${characters[0]}${'•'.repeat(characters.length - 1)}`;
    })
    .join('');
}
