import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { LedgerJournal } from '../../domain/entities/ledger-journal.entity';
import { TaxFiling } from '../../domain/entities/tax-filing.entity';
import {
  TaxFilingConcurrentChange,
  TaxFilingHasNoPayableAmount,
  TaxFilingNotFound,
  TaxRemittanceAmountMismatch,
} from '../../domain/errors/finance-domain-errors';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
} from '../../domain/ports/ledger-repository.port';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
  type TaxFilingPeriodRecord,
} from '../../domain/ports/tax-compliance-repository.port';

@Injectable()
export class RecordTaxRemittanceUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    periodId: string,
    input: {
      vatAmount: bigint;
      pitAmount: bigint;
      paymentReference: string;
      paidAt: Date;
      evidence?: { fileKey?: string; note?: string };
    },
    actorId: string,
  ): Promise<TaxFilingPeriodRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const period = await this.tax.findPeriod(tx, periodId);
      if (!period) throw new TaxFilingNotFound();
      TaxFiling.rehydrate(period.status).assertPayable();
      if (period.vatAmount < 0n || period.pitAmount < 0n || period.vatAmount + period.pitAmount <= 0n) {
        throw new TaxFilingHasNoPayableAmount();
      }
      if (period.vatAmount !== input.vatAmount || period.pitAmount !== input.pitAmount) {
        throw new TaxRemittanceAmountMismatch();
      }
      const journalId = await this.ledger.recordJournal(
        tx,
        tenantId,
        LedgerJournal.taxRemittance({
          tenantId,
          vatAmount: input.vatAmount,
          pitAmount: input.pitAmount,
        }),
        { memo: `tax.remittance:${period.taxYear}-${String(period.taxMonth).padStart(2, '0')}` },
      );
      const paid = await this.tax.recordRemittance(tx, tenantId, periodId, 'submitted', {
        ...input,
        evidence: input.evidence ?? null,
        journalId,
        recordedBy: actorId,
      });
      if (!paid) throw new TaxFilingConcurrentChange();
      return paid;
    });
  }
}
