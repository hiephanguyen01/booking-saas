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

/**
 * Freeze partner tax exactly once when the platform confirms the transaction —
 * i.e. at service completion, NOT at settlement release or payout. Tax assessment
 * and the payout lifecycle are independent: the dispute window only keeps the
 * partner's money unavailable, it does not decide whether tax is owed.
 *
 * The caller passes the settlement record it just transitioned, so the withheld
 * amounts read here are the ones frozen onto that row by `startDisputeWindow`.
 */
@Injectable()
export class RecordSettlementWithholdingUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
  ) {}

  async execute(
    tx: PrismaTx,
    tenantId: string,
    settlement: SettlementRecord,
    taxableRevenue: bigint,
  ): Promise<void> {
    const vatAmount = settlement.partnerVatWithheld;
    const pitAmount = settlement.partnerPitWithheld;
    if (taxableRevenue <= 0n || (vatAmount <= 0n && pitAmount <= 0n)) return;
    // One assessment per settlement, keyed by the settlement itself: at-least-once
    // outbox delivery of `booking.completed` therefore records exactly one event.
    // The prefix is deliberately unchanged from when this ran at release, so a
    // settlement assessed by an older deploy cannot produce a second event here.
    const sourceKey = `completion:${settlement.id}`;
    if (await this.tax.findEventBySourceKey(tx, tenantId, sourceKey)) return;
    const legs = LedgerJournal.withholding({
      tenantId,
      partnerId: settlement.partnerId,
      vatAmount,
      pitAmount,
    });
    const journalId = await this.ledger.recordJournal(tx, tenantId, legs, {
      bookingId: settlement.bookingId,
      paymentId: settlement.paymentId,
      memo: 'tax.withholding.transaction_accepted',
    });
    if (!(await this.tax.attachWithholdingJournal(tx, settlement.id, journalId))) {
      throw new Error('Settlement withholding journal was concurrently attached');
    }
    await this.tax.createEvent(tx, tenantId, {
      settlementId: settlement.id,
      bookingId: settlement.bookingId,
      partnerId: settlement.partnerId,
      eventType: 'withholding',
      sourceKey,
      taxableRevenue,
      vatAmount,
      pitAmount,
      journalId,
      // The filing period is the month the TRANSACTION was accepted, never the
      // month a later payout happened to clear — `preparePeriod` buckets by this.
      occurredAt: settlement.completedAt ?? settlement.updatedAt,
    });
  }
}
