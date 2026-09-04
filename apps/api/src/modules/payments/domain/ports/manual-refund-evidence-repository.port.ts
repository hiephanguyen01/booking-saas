import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const MANUAL_REFUND_EVIDENCE_REPOSITORY = Symbol(
  'MANUAL_REFUND_EVIDENCE_REPOSITORY',
);

export interface ManualRefundEvidenceUploadRecord {
  id: string;
  tenantId: string;
  operationId: string;
  objectKey: string;
  checksum: string;
  sizeBytes: number;
  contentType: string;
  status: 'pending' | 'claimed' | 'quarantined';
  expiresAt: Date;
  claimedAt: Date | null;
  quarantinedAt: Date | null;
  createdAt: Date;
}

export interface IManualRefundEvidenceRepository {
  createUpload(
    tx: PrismaTx,
    tenantId: string,
    input: {
      operationId: string;
      objectKey: string;
      checksum: string;
      sizeBytes: number;
      contentType: string;
      expiresAt: Date;
    },
  ): Promise<ManualRefundEvidenceUploadRecord>;
  findUpload(
    tx: PrismaTx,
    tenantId: string,
    operationId: string,
    objectKey: string,
  ): Promise<ManualRefundEvidenceUploadRecord | null>;
  claimUpload(tx: PrismaTx, tenantId: string, id: string, claimedAt: Date): Promise<boolean>;
  quarantineUpload(
    tx: PrismaTx,
    tenantId: string,
    id: string,
    quarantinedAt: Date,
  ): Promise<boolean>;
}
