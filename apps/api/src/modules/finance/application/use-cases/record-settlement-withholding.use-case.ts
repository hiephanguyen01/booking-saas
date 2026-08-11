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

/** Freeze partner tax exactly once when the post-dispute settlement is released. */
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
    // Keep the historical prefix stable so an in-flight settlement created by an
    // older deploy cannot produce a second event when the release worker resumes.
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
      memo: 'tax.withholding.settlement_released',
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
      occurredAt: settlement.releasedAt ?? settlement.updatedAt,
    });
  }
}
