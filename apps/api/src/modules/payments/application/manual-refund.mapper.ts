import type { ManualRefundStatusResponse } from '@booking/contracts';
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
