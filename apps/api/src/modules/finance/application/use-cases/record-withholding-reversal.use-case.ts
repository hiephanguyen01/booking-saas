import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { LedgerJournal } from '../../domain/entities/ledger-journal.entity';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
} from '../../domain/ports/ledger-repository.port';
import type { SettlementRecord } from '../../domain/ports/settlement-repository.port';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
} from '../../domain/ports/tax-compliance-repository.port';

function proportional(total: bigint, basisPart: bigint, basisTotal: bigint): bigint {
  if (basisPart >= basisTotal) return total;
  return basisTotal > 0n ? (total * basisPart) / basisTotal : 0n;
}

/** Confirmed cumulative refund → one incremental tax reversal linked to the assessment. */
@Injectable()
export class RecordWithholdingReversalUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
  ) {}

  async execute(
    tx: PrismaTx,
    tenantId: string,
    settlement: SettlementRecord,
    refundId: string,
    cumulativeRefundedAmount: bigint,
  ): Promise<void> {
    const sourceKey = `refund:${refundId}`;
    if (await this.tax.findEventBySourceKey(tx, tenantId, sourceKey)) return;
    const assessment = await this.tax.findAssessmentBySettlement(tx, settlement.id);
    if (!assessment || assessment.taxableRevenue <= 0n) return;
    const reversed = await this.tax.totalReversedForAssessment(tx, assessment.id);
    const targetRevenue =
      cumulativeRefundedAmount < assessment.taxableRevenue
        ? cumulativeRefundedAmount
        : assessment.taxableRevenue;
    const taxableRevenue = targetRevenue - reversed.taxableRevenue;
    const targetVat = proportional(assessment.vatAmount, targetRevenue, assessment.taxableRevenue);
    const targetPit = proportional(assessment.pitAmount, targetRevenue, assessment.taxableRevenue);
    const vatAmount = targetVat - reversed.vatAmount;
    const pitAmount = targetPit - reversed.pitAmount;
    if (taxableRevenue <= 0n || (vatAmount <= 0n && pitAmount <= 0n)) return;
    const journalId = await this.ledger.recordJournal(
      tx,
      tenantId,
      LedgerJournal.withholdingReversal({
        tenantId,
        partnerId: settlement.partnerId,
        vatAmount,
        pitAmount,
      }),
      {
        bookingId: settlement.bookingId,
        paymentId: settlement.paymentId,
        memo: `tax.withholding.reversal:${assessment.id}`,
      },
    );
    await this.tax.createEvent(tx, tenantId, {
      settlementId: settlement.id,
      bookingId: settlement.bookingId,
      partnerId: settlement.partnerId,
      eventType: 'reversal',
      sourceKey,
      originalEventId: assessment.id,
      taxableRevenue,
      vatAmount,
      pitAmount,
      journalId,
      occurredAt: settlement.updatedAt,
    });
  }
}
