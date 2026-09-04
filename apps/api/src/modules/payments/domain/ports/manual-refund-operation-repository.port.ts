import type { ManualRefundListQuery } from '@booking/contracts';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AccountNameVerificationResult,
  ManualRefundOperationStatus,
} from '../entities/manual-refund-operation.entity';

export const MANUAL_REFUND_OPERATION_REPOSITORY = Symbol('MANUAL_REFUND_OPERATION_REPOSITORY');

export type ManualRefundCustomerAcknowledgement = 'received' | 'not_received';

/** Internal persistence record. It must never be returned or spread into an HTTP response. */
export interface ManualRefundOperationRecord {
  id: string;
  tenantId: string;
  refundBatchId: string;
  status: ManualRefundOperationStatus;
  version: number;
  destinationBankCode: string | null;
  destinationAccountName: string | null;
  destinationAccountLast4: string | null;
  destinationAccountCiphertext: string | null;
  destinationEncryptionKeyVersion: string | null;
  destinationAccountFingerprint: string | null;
  destinationIsThirdParty: boolean;
  destinationConsentAt: Date | null;
  destinationSubmittedAt: Date | null;
  verificationResult: AccountNameVerificationResult | null;
  verificationMethod: 'lookup' | 'manual' | null;
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  makerUserId: string | null;
  claimedAt: Date | null;
  reassignedByUserId: string | null;
  reassignmentReason: string | null;
  reassignedAt: Date | null;
  transferReference: string | null;
  transferReferenceNormalized: string | null;
  evidenceObjectKey: string | null;
  evidenceContentType: string | null;
  evidenceSizeBytes: number | null;
  evidenceSha256: string | null;
  evidenceVerifiedAt: Date | null;
  transferSubmittedByUserId: string | null;
  transferSubmittedAt: Date | null;
  checkedByUserId: string | null;
  checkedAt: Date | null;
  rejectionReason: string | null;
  reopenedByUserId: string | null;
  reopenReason: string | null;
  reopenedAt: Date | null;
  readyAt: Date | null;
  transferDueAt: Date | null;
  completedAt: Date | null;
  customerAcknowledgement: ManualRefundCustomerAcknowledgement | null;
  customerAcknowledgedAt: Date | null;
  customerAcknowledgementNote: string | null;
  ciphertextPurgedAt: Date | null;
  breakGlassByUserId: string | null;
  breakGlassReason: string | null;
  breakGlassAuthenticatedAt: Date | null;
  breakGlassAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ManualRefundOperationPatch = Partial<
  Omit<
    ManualRefundOperationRecord,
    | 'id'
    | 'tenantId'
    | 'refundBatchId'
    | 'version'
    | 'transferReferenceNormalized'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export interface ManualRefundOperationViewRecord {
  operation: ManualRefundOperationRecord;
  bookingId: string;
  bookingCode: string;
  requestedAmount: bigint;
}

export interface IManualRefundOperationRepository {
  isWorkflowEnabled(tx: PrismaTx, tenantId: string): Promise<boolean>;
  createForBatch(tx: PrismaTx, tenantId: string, refundBatchId: string): Promise<void>;
  findById(tx: PrismaTx, tenantId: string, id: string): Promise<ManualRefundOperationRecord | null>;
  findByBatchId(
    tx: PrismaTx,
    tenantId: string,
    refundBatchId: string,
  ): Promise<ManualRefundOperationRecord | null>;
  findViewById(
    tx: PrismaTx,
    tenantId: string,
    id: string,
  ): Promise<ManualRefundOperationViewRecord | null>;
  listViews(
    tx: PrismaTx,
    tenantId: string,
    query: ManualRefundListQuery,
    overdueBefore: Date | null,
  ): Promise<RepoPage<ManualRefundOperationViewRecord>>;
  casUpdate(
    tx: PrismaTx,
    tenantId: string,
    id: string,
    expectedStatus: ManualRefundOperationStatus,
    expectedVersion: number,
    patch: ManualRefundOperationPatch,
  ): Promise<ManualRefundOperationRecord | null>;
}
