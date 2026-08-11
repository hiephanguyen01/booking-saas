import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateTaxEventInput,
  ITaxComplianceRepository,
  TaxCertificateRecord,
  TaxFilingPeriodRecord,
  TaxWithholdingEventRecord,
} from '../../domain/ports/tax-compliance-repository.port';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function monthBounds(taxYear: number, taxMonth: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(taxYear, taxMonth - 1, 1) - VN_OFFSET_MS),
    to: new Date(Date.UTC(taxYear, taxMonth, 1) - VN_OFFSET_MS),
  };
}

function signed(event: { eventType: string }, amount: bigint): bigint {
  return event.eventType === 'reversal' ? -amount : amount;
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
        evidence: input.evidence
          ? (input.evidence as Prisma.InputJsonObject)
          : Prisma.JsonNull,
      },
    });
    return this.findPeriod(tx, periodId);
  }

  async issueCertificate(
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
  ): Promise<TaxCertificateRecord> {
    const events = await tx.taxWithholdingEvent.findMany({
      where: {
        tenantId,
        partnerId,
        filingPeriod: { taxYear, status: 'paid' },
      },
    });
    const totals = events.reduce(
      (acc, event) => ({
        vatAmount: acc.vatAmount + signed(event, event.vatAmount),
        pitAmount: acc.pitAmount + signed(event, event.pitAmount),
      }),
      { vatAmount: 0n, pitAmount: 0n },
    );
    const row = await tx.taxWithholdingCertificate.upsert({
      where: { tenantId_partnerId_taxYear: { tenantId, partnerId, taxYear } },
      update: {
        ...input,
        ...totals,
        status: 'issued',
        issuedAt: new Date(),
      },
      create: {
        tenantId,
        partnerId,
        taxYear,
        ...input,
        ...totals,
        status: 'issued',
        issuedAt: new Date(),
      },
      include: { partner: { select: { name: true } } },
    });
    return { ...row, partnerName: row.partner.name };
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
}
