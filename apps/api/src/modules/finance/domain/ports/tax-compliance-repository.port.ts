import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const TAX_COMPLIANCE_REPOSITORY = Symbol('TAX_COMPLIANCE_REPOSITORY');

export type TaxWithholdingEventKind = 'withholding' | 'reversal';
export type TaxFilingState = 'draft' | 'submitted' | 'paid';
export type TaxCertificateState = 'draft' | 'issued' | 'voided';

export interface TaxWithholdingEventRecord {
  id: string;
  tenantId: string;
  settlementId: string;
  bookingId: string;
  partnerId: string;
  eventType: TaxWithholdingEventKind;
  sourceKey: string;
  originalEventId: string | null;
  taxableRevenue: bigint;
  vatAmount: bigint;
  pitAmount: bigint;
  journalId: string;
  occurredAt: Date;
  filingPeriodId: string | null;
}

export interface TaxFilingPeriodRecord {
  id: string;
  tenantId: string;
  taxYear: number;
  taxMonth: number;
  status: TaxFilingState;
  taxableRevenue: bigint;
  vatAmount: bigint;
  pitAmount: bigint;
  preparedBy: string;
  submittedBy: string | null;
  submissionReference: string | null;
  submittedAt: Date | null;
  paidAt: Date | null;
  eventCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxCertificateRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  partnerName: string;
  taxYear: number;
  status: TaxCertificateState;
  version: number;
  certificateNumber: string | null;
  vatAmount: bigint;
  pitAmount: bigint;
  fileKey: string | null;
  checksum: string | null;
  issuedAt: Date | null;
  supersedesId: string | null;
  documentUploadId: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxDocumentUploadRecord {
  id: string;
  tenantId: string;
  objectKey: string;
  checksum: string;
  sizeBytes: number;
  contentType: string;
  status: 'pending' | 'attached' | 'expired';
  expiresAt: Date;
  attachedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface TaxCertificateReadiness {
  eventCount: number;
  unsettledEventCount: number;
  vatAmount: bigint;
  pitAmount: bigint;
}

export interface CreateTaxEventInput {
  settlementId: string;
  bookingId: string;
  partnerId: string;
  eventType: TaxWithholdingEventKind;
  sourceKey: string;
  originalEventId?: string | null;
  taxableRevenue: bigint;
  vatAmount: bigint;
  pitAmount: bigint;
  journalId: string;
  occurredAt: Date;
}

export interface ITaxComplianceRepository {
  findEventBySourceKey(
    tx: PrismaTx,
    tenantId: string,
    sourceKey: string,
  ): Promise<TaxWithholdingEventRecord | null>;
  findAssessmentBySettlement(
    tx: PrismaTx,
    settlementId: string,
  ): Promise<TaxWithholdingEventRecord | null>;
  totalReversedForAssessment(
    tx: PrismaTx,
    assessmentId: string,
  ): Promise<{ taxableRevenue: bigint; vatAmount: bigint; pitAmount: bigint }>;
  createEvent(
    tx: PrismaTx,
    tenantId: string,
    input: CreateTaxEventInput,
  ): Promise<TaxWithholdingEventRecord>;
  attachWithholdingJournal(tx: PrismaTx, settlementId: string, journalId: string): Promise<boolean>;
  preparePeriod(
    tx: PrismaTx,
    tenantId: string,
    taxYear: number,
    taxMonth: number,
    preparedBy: string,
  ): Promise<TaxFilingPeriodRecord>;
  listPeriods(tx: PrismaTx, tenantId: string): Promise<TaxFilingPeriodRecord[]>;
  findPeriod(tx: PrismaTx, id: string): Promise<TaxFilingPeriodRecord | null>;
  submitPeriod(
    tx: PrismaTx,
    id: string,
    expectedStatus: 'draft',
    submittedBy: string,
    submissionReference: string,
  ): Promise<TaxFilingPeriodRecord | null>;
  recordRemittance(
    tx: PrismaTx,
    tenantId: string,
    periodId: string,
    expectedStatus: 'submitted',
    input: {
      vatAmount: bigint;
      pitAmount: bigint;
      paymentReference: string;
      evidence: { fileKey?: string; note?: string } | null;
      journalId: string;
      paidAt: Date;
      recordedBy: string;
    },
  ): Promise<TaxFilingPeriodRecord | null>;
  createDocumentUpload(
    tx: PrismaTx,
    tenantId: string,
    input: {
      objectKey: string;
      checksum: string;
      sizeBytes: number;
      contentType: string;
      expiresAt: Date;
    },
  ): Promise<TaxDocumentUploadRecord>;
  findDocumentUpload(
    tx: PrismaTx,
    tenantId: string,
    objectKey: string,
  ): Promise<TaxDocumentUploadRecord | null>;
  lockCertificateYear(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
  ): Promise<void>;
  certificateReadiness(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
  ): Promise<TaxCertificateReadiness>;
  findActiveCertificate(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
  ): Promise<TaxCertificateRecord | null>;
  findLatestCertificate(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
  ): Promise<TaxCertificateRecord | null>;
  createCertificate(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
    input: {
      certificateNumber: string;
      fileKey: string;
      checksum: string;
      issuedBy: string;
      version: number;
      supersedesId: string | null;
      documentUploadId: string;
      vatAmount: bigint;
      pitAmount: bigint;
    },
  ): Promise<TaxCertificateRecord>;
  attachDocumentUpload(
    tx: PrismaTx,
    tenantId: string,
    uploadId: string,
    attachedAt: Date,
  ): Promise<boolean>;
  voidCertificate(
    tx: PrismaTx,
    tenantId: string,
    certificateId: string,
    input: { voidedAt: Date; voidedBy: string; voidReason: string },
  ): Promise<TaxCertificateRecord | null>;
  listCertificates(
    tx: PrismaTx,
    tenantId: string,
    partnerId?: string,
  ): Promise<TaxCertificateRecord[]>;
  findCertificate(
    tx: PrismaTx,
    tenantId: string,
    certificateId: string,
  ): Promise<TaxCertificateRecord | null>;
}
