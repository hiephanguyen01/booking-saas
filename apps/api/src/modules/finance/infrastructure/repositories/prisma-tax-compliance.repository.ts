import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateTaxEventInput,
  ITaxComplianceRepository,
  TaxCertificateRecord,
  TaxFilingPeriodRecord,
  TaxDocumentUploadRecord,
  TaxCertificateReadiness,
  TaxWithholdingEventRecord,
  SettlementTaxPosition,
} from '../../domain/ports/tax-compliance-repository.port';
import { TaxCertificateConflict } from '../../domain/errors/finance-domain-errors';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function monthBounds(taxYear: number, taxMonth: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(taxYear, taxMonth - 1, 1) - VN_OFFSET_MS),
    to: new Date(Date.UTC(taxYear, taxMonth, 1) - VN_OFFSET_MS),
  };
}

function yearBounds(taxYear: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(taxYear, 0, 1) - VN_OFFSET_MS),
    to: new Date(Date.UTC(taxYear + 1, 0, 1) - VN_OFFSET_MS),
  };
}

function signed(event: { eventType: string }, amount: bigint): bigint {
  return event.eventType === 'reversal' ? -amount : amount;
}

function sum<T>(items: T[], pick: (item: T) => bigint): bigint {
  return items.reduce((total, item) => total + pick(item), 0n);
}

@Injectable()
export class PrismaTaxComplianceRepository implements ITaxComplianceRepository {
  async findEventBySourceKey(
    tx: PrismaTx,
    tenantId: string,
    sourceKey: string,
  ): Promise<TaxWithholdingEventRecord | null> {
    return tx.taxWithholdingEvent.findUnique({
      where: { tenantId_sourceKey: { tenantId, sourceKey } },
    });
  }

  async findAssessmentBySettlement(
    tx: PrismaTx,
    settlementId: string,
  ): Promise<TaxWithholdingEventRecord | null> {
    return tx.taxWithholdingEvent.findFirst({
      where: { settlementId, eventType: 'withholding' },
      orderBy: { occurredAt: 'asc' },
    });
  }

  async totalReversedForAssessment(
    tx: PrismaTx,
    assessmentId: string,
  ): Promise<{ taxableRevenue: bigint; vatAmount: bigint; pitAmount: bigint }> {
    const result = await tx.taxWithholdingEvent.aggregate({
      where: { originalEventId: assessmentId, eventType: 'reversal' },
      _sum: { taxableRevenue: true, vatAmount: true, pitAmount: true },
    });
    return {
      taxableRevenue: result._sum.taxableRevenue ?? 0n,
      vatAmount: result._sum.vatAmount ?? 0n,
      pitAmount: result._sum.pitAmount ?? 0n,
    };
  }

  /**
   * Rebuild the tax position from the event trail in one pass. Reads every event
   * of the settlement rather than aggregating, because a settlement carries one
   * assessment plus a handful of reversals — and the assessment's own timestamp
   * has to come back with the totals.
   */
  async taxPositionForSettlement(
    tx: PrismaTx,
    settlementId: string,
  ): Promise<SettlementTaxPosition | null> {
    const events = await tx.taxWithholdingEvent.findMany({
      where: { settlementId },
      orderBy: { occurredAt: 'asc' },
    });
    const assessment = events.find((event) => event.eventType === 'withholding');
    if (!assessment) return null;
    const reversals = events.filter(
      (event) => event.eventType === 'reversal' && event.originalEventId === assessment.id,
    );
    const reversedTaxableRevenue = sum(reversals, (event) => event.taxableRevenue);
    const reversedVat = sum(reversals, (event) => event.vatAmount);
    const reversedPit = sum(reversals, (event) => event.pitAmount);
    return {
      assessedTaxableRevenue: assessment.taxableRevenue,
      assessedVat: assessment.vatAmount,
      assessedPit: assessment.pitAmount,
      assessedAt: assessment.occurredAt,
      reversedTaxableRevenue,
      reversedVat,
      reversedPit,
      reversalCount: reversals.length,
      netVat: assessment.vatAmount - reversedVat,
      netPit: assessment.pitAmount - reversedPit,
    };
  }

  createEvent(
    tx: PrismaTx,
    tenantId: string,
    input: CreateTaxEventInput,
  ): Promise<TaxWithholdingEventRecord> {
    return tx.taxWithholdingEvent.create({ data: { tenantId, ...input } });
  }

  async attachWithholdingJournal(
    tx: PrismaTx,
    settlementId: string,
    journalId: string,
  ): Promise<boolean> {
    const changed = await tx.bookingSettlement.updateMany({
      where: { id: settlementId, withholdingJournalId: null },
      data: { withholdingJournalId: journalId },
    });
    return changed.count === 1;
  }

  async preparePeriod(
    tx: PrismaTx,
    tenantId: string,
    taxYear: number,
    taxMonth: number,
    preparedBy: string,
  ): Promise<TaxFilingPeriodRecord> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${taxYear}:${taxMonth}`}, 0))`;
    const key = { tenantId_taxYear_taxMonth: { tenantId, taxYear, taxMonth } };
    const existing = await tx.taxFilingPeriod.findUnique({ where: key });
    const period =
      existing ??
      (await tx.taxFilingPeriod.create({
        data: { tenantId, taxYear, taxMonth, preparedBy },
      }));
    if (period.status === 'draft') {
      const { from, to } = monthBounds(taxYear, taxMonth);
      await tx.taxWithholdingEvent.updateMany({
        where: { tenantId, filingPeriodId: null, occurredAt: { gte: from, lt: to } },
        data: { filingPeriodId: period.id },
      });
      const events = await tx.taxWithholdingEvent.findMany({
        where: { filingPeriodId: period.id },
      });
      const totals = events.reduce(
        (acc, event) => ({
          taxableRevenue: acc.taxableRevenue + signed(event, event.taxableRevenue),
          vatAmount: acc.vatAmount + signed(event, event.vatAmount),
          pitAmount: acc.pitAmount + signed(event, event.pitAmount),
        }),
        { taxableRevenue: 0n, vatAmount: 0n, pitAmount: 0n },
      );
      await tx.taxFilingPeriod.update({ where: { id: period.id }, data: totals });
    }
    const refreshed = await tx.taxFilingPeriod.findUniqueOrThrow({
      where: { id: period.id },
      include: { _count: { select: { events: true } } },
    });
    return { ...refreshed, eventCount: refreshed._count.events };
  }

  async listPeriods(tx: PrismaTx, tenantId: string): Promise<TaxFilingPeriodRecord[]> {
    const rows = await tx.taxFilingPeriod.findMany({
      where: { tenantId },
      include: { _count: { select: { events: true } } },
      orderBy: [{ taxYear: 'desc' }, { taxMonth: 'desc' }],
    });
    return rows.map((row) => ({ ...row, eventCount: row._count.events }));
  }

  async findPeriod(tx: PrismaTx, id: string): Promise<TaxFilingPeriodRecord | null> {
    const row = await tx.taxFilingPeriod.findUnique({
      where: { id },
      include: { _count: { select: { events: true } } },
    });
    return row ? { ...row, eventCount: row._count.events } : null;
  }

  async submitPeriod(
    tx: PrismaTx,
    id: string,
    expectedStatus: 'draft',
    submittedBy: string,
    submissionReference: string,
  ): Promise<TaxFilingPeriodRecord | null> {
    const changed = await tx.taxFilingPeriod.updateMany({
      where: { id, status: expectedStatus },
      data: { status: 'submitted', submittedBy, submissionReference, submittedAt: new Date() },
    });
    return changed.count === 1 ? this.findPeriod(tx, id) : null;
  }

  async recordRemittance(
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
  ): Promise<TaxFilingPeriodRecord | null> {
    const changed = await tx.taxFilingPeriod.updateMany({
      where: { id: periodId, status: expectedStatus },
      data: { status: 'paid', paidAt: input.paidAt },
    });
    if (changed.count !== 1) return null;
    await tx.taxRemittance.create({
      data: {
        tenantId,
        filingPeriodId: periodId,
        ...input,
        evidence: input.evidence ? (input.evidence as Prisma.InputJsonObject) : Prisma.JsonNull,
      },
    });
    return this.findPeriod(tx, periodId);
  }

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
  ): Promise<TaxDocumentUploadRecord> {
    return tx.taxDocumentUpload.create({ data: { tenantId, ...input } });
  }

  findDocumentUpload(
    tx: PrismaTx,
    tenantId: string,
    objectKey: string,
  ): Promise<TaxDocumentUploadRecord | null> {
    return tx.taxDocumentUpload.findUnique({
      where: { tenantId_objectKey: { tenantId, objectKey } },
    });
  }

  async lockCertificateYear(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${partnerId}:${taxYear}:tax-certificate`}, 0))`;
  }

  async certificateReadiness(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
  ): Promise<TaxCertificateReadiness> {
    const { from, to } = yearBounds(taxYear);
    const events = await tx.taxWithholdingEvent.findMany({
      where: { tenantId, partnerId, occurredAt: { gte: from, lt: to } },
      include: { filingPeriod: { select: { taxYear: true, status: true } } },
    });
    return events.reduce<TaxCertificateReadiness>(
      (acc, event) => ({
        eventCount: acc.eventCount + 1,
        unsettledEventCount:
          acc.unsettledEventCount +
          (event.filingPeriod?.taxYear === taxYear && event.filingPeriod.status === 'paid' ? 0 : 1),
        vatAmount: acc.vatAmount + signed(event, event.vatAmount),
        pitAmount: acc.pitAmount + signed(event, event.pitAmount),
      }),
      { eventCount: 0, unsettledEventCount: 0, vatAmount: 0n, pitAmount: 0n },
    );
  }

  findActiveCertificate(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
  ): Promise<TaxCertificateRecord | null> {
    return this.findCertificateWhere(tx, { tenantId, partnerId, taxYear, status: 'issued' });
  }

  findLatestCertificate(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    taxYear: number,
  ): Promise<TaxCertificateRecord | null> {
    return this.findCertificateWhere(tx, { tenantId, partnerId, taxYear }, { version: 'desc' });
  }

  async createCertificate(
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
  ): Promise<TaxCertificateRecord> {
    try {
      const row = await tx.taxWithholdingCertificate.create({
        data: {
          tenantId,
          partnerId,
          taxYear,
          ...input,
          status: 'issued',
          issuedAt: new Date(),
        },
        include: { partner: { select: { name: true } } },
      });
      return { ...row, partnerName: row.partner.name };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new TaxCertificateConflict();
      }
      throw error;
    }
  }

  async attachDocumentUpload(
    tx: PrismaTx,
    tenantId: string,
    uploadId: string,
    attachedAt: Date,
  ): Promise<boolean> {
    const changed = await tx.taxDocumentUpload.updateMany({
      where: { id: uploadId, tenantId, status: 'pending', expiresAt: { gt: attachedAt } },
      data: { status: 'attached', attachedAt },
    });
    return changed.count === 1;
  }

  async voidCertificate(
    tx: PrismaTx,
    tenantId: string,
    certificateId: string,
    input: { voidedAt: Date; voidedBy: string; voidReason: string },
  ): Promise<TaxCertificateRecord | null> {
    const changed = await tx.taxWithholdingCertificate.updateMany({
      where: { id: certificateId, tenantId, status: 'issued' },
      data: { status: 'voided', ...input },
    });
    return changed.count === 1 ? this.findCertificate(tx, tenantId, certificateId) : null;
  }

  async listCertificates(
    tx: PrismaTx,
    tenantId: string,
    partnerId?: string,
  ): Promise<TaxCertificateRecord[]> {
    const rows = await tx.taxWithholdingCertificate.findMany({
      where: { tenantId, partnerId },
      include: { partner: { select: { name: true } } },
      orderBy: [{ taxYear: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({ ...row, partnerName: row.partner.name }));
  }

  async findCertificate(
    tx: PrismaTx,
    tenantId: string,
    certificateId: string,
  ): Promise<TaxCertificateRecord | null> {
    const row = await tx.taxWithholdingCertificate.findFirst({
      where: { id: certificateId, tenantId },
      include: { partner: { select: { name: true } } },
    });
    return row ? { ...row, partnerName: row.partner.name } : null;
  }

  private async findCertificateWhere(
    tx: PrismaTx,
    where: {
      tenantId: string;
      partnerId: string;
      taxYear: number;
      status?: 'issued';
    },
    orderBy?: { version: 'desc' },
  ): Promise<TaxCertificateRecord | null> {
    const row = await tx.taxWithholdingCertificate.findFirst({
      where,
      orderBy,
      include: { partner: { select: { name: true } } },
    });
    return row ? { ...row, partnerName: row.partner.name } : null;
  }
}
