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

/** Freeze provisional partner tax exactly once when service completion is confirmed. */
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
      memo: 'tax.withholding.service_completed',
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
      occurredAt: settlement.completedAt ?? settlement.updatedAt,
    });
  }
}
