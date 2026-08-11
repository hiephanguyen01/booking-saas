import type {
  PartnerTaxAssessmentStatus,
  PartnerTaxClassificationSource,
  PartnerTaxStatus,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TaxThresholdRule } from '../../../../shared/domain/tax/threshold';

export const PARTNER_TAX_REPOSITORY = Symbol('PARTNER_TAX_REPOSITORY');

export interface PartnerTaxAssessmentRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  taxYear: number;
  status: PartnerTaxAssessmentStatus;
  platformRevenue: bigint;
  externalRevenue: bigint;
  thresholdAmount: bigint;
  thresholdRuleId: string;
  thresholdLegalRef: string;
  thresholdRevision: number;
  crossedAt: Date | null;
  crossedQuarter: number | null;
  classificationSource: PartnerTaxClassificationSource;
  manualOverrideStatus: PartnerTaxStatus | null;
  manualOverrideReason: string | null;
  manualOverrideBy: string | null;
  manualOverrideUntil: Date | null;
  declarationUpdatedAt: Date | null;
  evaluatedAt: Date;
  version: number;
}

export interface PartnerTaxAssessmentUpdate {
  status: PartnerTaxAssessmentStatus;
  platformRevenue: bigint;
  externalRevenue: bigint;
  thresholdAmount: bigint;
  thresholdRuleId: string;
  crossedAt: Date | null;
  crossedQuarter: number | null;
  classificationSource: PartnerTaxClassificationSource;
  declarationUpdatedAt?: Date | null;
  evaluatedAt: Date;
}

export interface IPartnerTaxRepository {
  listActiveThresholdRules(tx: PrismaTx): Promise<TaxThresholdRule[]>;
  findAssessment(
    tx: PrismaTx,
    partnerId: string,
    taxYear: number,
  ): Promise<PartnerTaxAssessmentRecord | null>;
  ensureAssessment(
    tx: PrismaTx,
    input: {
      tenantId: string;
      partnerId: string;
      taxYear: number;
      thresholdRuleId: string;
      thresholdAmount: bigint;
      initialStatus: PartnerTaxAssessmentStatus;
    },
  ): Promise<PartnerTaxAssessmentRecord>;
  lockAssessment(tx: PrismaTx, assessmentId: string): Promise<PartnerTaxAssessmentRecord | null>;
  insertRevenueEvent(
    tx: PrismaTx,
    input: {
      tenantId: string;
      partnerId: string;
      assessmentId: string;
      sourceType: 'settlement_release' | 'settlement_clawback' | 'backfill_adjustment';
      sourceId: string;
      amount: bigint;
      serviceDate: Date;
      metadata: Record<string, unknown>;
    },
  ): Promise<boolean>;
  findRevenueAmountBySource(
    tx: PrismaTx,
    sourceType: 'settlement_release',
    sourceId: string,
  ): Promise<bigint | null>;
  sumPlatformRevenue(tx: PrismaTx, assessmentId: string): Promise<bigint>;
  listReleasedRevenueFacts(
    tx: PrismaTx,
    partnerId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ journalId: string; amount: bigint; serviceDate: Date; bookingId: string }>>;
  createDeclaration(
    tx: PrismaTx,
    input: {
      tenantId: string;
      partnerId: string;
      assessmentId: string;
      externalRevenue: bigint;
      declaredByUserId: string;
      note: string | null;
      declaredAt: Date;
    },
  ): Promise<void>;
  updateAssessment(
    tx: PrismaTx,
    assessmentId: string,
    input: PartnerTaxAssessmentUpdate,
  ): Promise<PartnerTaxAssessmentRecord>;
  setManualOverride(
    tx: PrismaTx,
    assessmentId: string,
    input: {
      status: PartnerTaxStatus;
      reason: string;
      actorId: string;
      until: Date;
      evaluatedAt: Date;
    },
  ): Promise<PartnerTaxAssessmentRecord>;
}
