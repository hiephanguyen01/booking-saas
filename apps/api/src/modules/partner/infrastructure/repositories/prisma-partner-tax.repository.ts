import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TaxThresholdRule } from '../../../../shared/domain/tax/threshold';
import type {
  IPartnerTaxRepository,
  PartnerTaxAssessmentRecord,
  PartnerTaxAssessmentUpdate,
} from '../../domain/ports/partner-tax-repository.port';

const assessmentInclude = {
  thresholdRule: { select: { legalRef: true, revision: true } },
} as const;

type AssessmentRow = Awaited<ReturnType<PrismaTx['partnerTaxYearAssessment']['findUnique']>>;

function toRecord(
  row: NonNullable<AssessmentRow> & {
    thresholdRule?: { legalRef: string; revision: number };
  },
): PartnerTaxAssessmentRecord {
  const thresholdRule = row.thresholdRule;
  if (!thresholdRule) throw new Error('Tax assessment threshold relation was not loaded');
  return {
    id: row.id,
    tenantId: row.tenantId,
    partnerId: row.partnerId,
    taxYear: row.taxYear,
    status: row.status,
    platformRevenue: row.platformRevenue,
    externalRevenue: row.externalRevenue,
    thresholdAmount: row.thresholdAmount,
    thresholdRuleId: row.thresholdRuleId,
    thresholdLegalRef: thresholdRule.legalRef,
    thresholdRevision: thresholdRule.revision,
    crossedAt: row.crossedAt,
    crossedQuarter: row.crossedQuarter,
    classificationSource: row.classificationSource,
    manualOverrideStatus: row.manualOverrideStatus,
    manualOverrideReason: row.manualOverrideReason,
    manualOverrideBy: row.manualOverrideBy,
    manualOverrideUntil: row.manualOverrideUntil,
    declarationUpdatedAt: row.declarationUpdatedAt,
    evaluatedAt: row.evaluatedAt,
    version: row.version,
  };
}

@Injectable()
export class PrismaPartnerTaxRepository implements IPartnerTaxRepository {
  async listActiveThresholdRules(tx: PrismaTx): Promise<TaxThresholdRule[]> {
    const rows = await tx.taxThresholdRule.findMany({
      where: { code: 'household_annual_revenue', isActive: true },
      orderBy: [{ effectiveFrom: 'desc' }, { revision: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      thresholdAmount: row.thresholdAmount,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      legalRef: row.legalRef,
      revision: row.revision,
    }));
  }

  async findAssessment(
    tx: PrismaTx,
    partnerId: string,
    taxYear: number,
  ): Promise<PartnerTaxAssessmentRecord | null> {
    const row = await tx.partnerTaxYearAssessment.findFirst({
      where: { partnerId, taxYear },
      include: assessmentInclude,
    });
    return row ? toRecord(row) : null;
  }

  async ensureAssessment(
    tx: PrismaTx,
    input: {
      tenantId: string;
      partnerId: string;
      taxYear: number;
      thresholdRuleId: string;
      thresholdAmount: bigint;
      initialStatus: 'missing_declaration' | 'below_threshold' | 'exceeded' | 'manual_review';
    },
  ): Promise<PartnerTaxAssessmentRecord> {
    const row = await tx.partnerTaxYearAssessment.upsert({
      where: {
        tenantId_partnerId_taxYear: {
          tenantId: input.tenantId,
          partnerId: input.partnerId,
          taxYear: input.taxYear,
        },
      },
      update: {
        thresholdRuleId: input.thresholdRuleId,
        thresholdAmount: input.thresholdAmount,
      },
      create: {
        tenantId: input.tenantId,
        partnerId: input.partnerId,
        taxYear: input.taxYear,
        thresholdRuleId: input.thresholdRuleId,
        thresholdAmount: input.thresholdAmount,
        status: input.initialStatus,
      },
      include: assessmentInclude,
    });
    return toRecord(row);
  }

  async lockAssessment(
    tx: PrismaTx,
    assessmentId: string,
  ): Promise<PartnerTaxAssessmentRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM partner_tax_year_assessments
      WHERE id = ${assessmentId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) return null;
    const row = await tx.partnerTaxYearAssessment.findUnique({
      where: { id: assessmentId },
      include: assessmentInclude,
    });
    return row ? toRecord(row) : null;
  }

  async insertRevenueEvent(
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
  ): Promise<boolean> {
    const result = await tx.partnerTaxRevenueEvent.createMany({
      data: [{ ...input, metadata: input.metadata as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  async findRevenueAmountBySource(
    tx: PrismaTx,
    sourceType: 'settlement_release',
    sourceId: string,
  ): Promise<bigint | null> {
    const event = await tx.partnerTaxRevenueEvent.findFirst({
      where: { sourceType, sourceId },
      select: { amount: true },
    });
    return event?.amount ?? null;
  }

  async sumPlatformRevenue(tx: PrismaTx, assessmentId: string): Promise<bigint> {
    const result = await tx.partnerTaxRevenueEvent.aggregate({
      where: { assessmentId },
      _sum: { amount: true },
    });
    const total = result._sum.amount ?? 0n;
    return total > 0n ? total : 0n;
  }

  async listReleasedRevenueFacts(
    tx: PrismaTx,
    partnerId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ journalId: string; amount: bigint; serviceDate: Date; bookingId: string }>> {
    return tx.$queryRaw<
      Array<{ journalId: string; amount: bigint; serviceDate: Date; bookingId: string }>
    >`
      SELECT
        s.release_journal_id AS "journalId",
        s.partner_gross_earning + s.tenant_commission_gross AS amount,
        lower(COALESCE(b.timeslot, b.blocked_period)) AS "serviceDate",
        b.id AS "bookingId"
      FROM booking_settlements s
      JOIN bookings b ON b.id = s.booking_id
      WHERE s.partner_id = ${partnerId}::uuid
        AND s.status = 'released'
        AND s.kind <> 'cancellation_fee'
        AND s.release_journal_id IS NOT NULL
        AND lower(COALESCE(b.timeslot, b.blocked_period)) >= ${from}
        AND lower(COALESCE(b.timeslot, b.blocked_period)) < ${to}
    `;
  }

  async createDeclaration(
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
  ): Promise<void> {
    await tx.partnerTaxDeclaration.create({ data: input });
  }

  async updateAssessment(
    tx: PrismaTx,
    assessmentId: string,
    input: PartnerTaxAssessmentUpdate,
  ): Promise<PartnerTaxAssessmentRecord> {
    const row = await tx.partnerTaxYearAssessment.update({
      where: { id: assessmentId },
      data: {
        ...input,
        version: { increment: 1 },
      },
      include: assessmentInclude,
    });
    return toRecord(row);
  }

  async setManualOverride(
    tx: PrismaTx,
    assessmentId: string,
    input: {
      status: import('@booking/contracts').PartnerTaxStatus;
      reason: string;
      actorId: string;
      until: Date;
      evaluatedAt: Date;
    },
  ): Promise<PartnerTaxAssessmentRecord> {
    const row = await tx.partnerTaxYearAssessment.update({
      where: { id: assessmentId },
      data: {
        manualOverrideStatus: input.status,
        manualOverrideReason: input.reason,
        manualOverrideBy: input.actorId,
        manualOverrideUntil: input.until,
        classificationSource: 'manual_override',
        status: input.status === 'household_below_threshold' ? 'below_threshold' : 'exceeded',
        evaluatedAt: input.evaluatedAt,
        version: { increment: 1 },
      },
      include: assessmentInclude,
    });
    return toRecord(row);
  }
}
