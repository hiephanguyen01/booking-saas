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
  certificateNumber: string | null;
  vatAmount: bigint;
  pitAmount: bigint;
  fileKey: string | null;
  checksum: string | null;
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  attachWithholdingJournal(
    tx: PrismaTx,
    settlementId: string,
    journalId: string,
  ): Promise<boolean>;
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
  issueCertificate(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
    input: {
      certificateNumber: string;
      fileKey: string;
      checksum: string;
      issuedBy: string;
    },
  ): Promise<TaxCertificateRecord>;
  listCertificates(
    tx: PrismaTx,
    tenantId: string,
    partnerId?: string,
  ): Promise<TaxCertificateRecord[]>;
}
