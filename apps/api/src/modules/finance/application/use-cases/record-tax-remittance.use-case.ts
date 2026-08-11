import { Inject, Injectable } from '@nestjs/common';
import { MAX_TAX_DOCUMENT_SIZE_BYTES } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import { LedgerJournal } from '../../domain/entities/ledger-journal.entity';
import { TaxFiling } from '../../domain/entities/tax-filing.entity';
import {
  TaxFilingConcurrentChange,
  TaxFilingHasNoPayableAmount,
  TaxFilingNotFound,
  InvalidTaxDocumentKey,
  TaxDocumentUploadExpired,
  TaxDocumentUploadInvalid,
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
import { isTaxDocumentKeyForTenant } from '../../domain/tax-document-key';

@Injectable()
export class RecordTaxRemittanceUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
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
    const fileKey = input.evidence?.fileKey;
    if (fileKey && !isTaxDocumentKeyForTenant(tenantId, fileKey)) {
      throw new InvalidTaxDocumentKey();
    }
    const inspection = fileKey
      ? await this.storage.inspectPrivatePdf({
          key: fileKey,
          maxSizeBytes: MAX_TAX_DOCUMENT_SIZE_BYTES,
        })
      : null;
    if (inspection && !inspection.valid) {
      throw new TaxDocumentUploadInvalid(
        `The private tax PDF failed verification (${inspection.reason ?? 'unknown'})`,
      );
    }

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const period = await this.tax.findPeriod(tx, periodId);
      if (!period) throw new TaxFilingNotFound();
      TaxFiling.rehydrate(period.status).assertPayable();
      if (
        period.vatAmount < 0n ||
        period.pitAmount < 0n ||
        period.vatAmount + period.pitAmount <= 0n
      ) {
        throw new TaxFilingHasNoPayableAmount();
      }
      if (period.vatAmount !== input.vatAmount || period.pitAmount !== input.pitAmount) {
        throw new TaxRemittanceAmountMismatch();
      }
      if (fileKey && inspection) {
        const upload = await this.tax.findDocumentUpload(tx, tenantId, fileKey);
        if (!upload || upload.status !== 'pending') {
          throw new TaxDocumentUploadInvalid('The PDF is not a pending upload for this tenant');
        }
        const now = new Date();
        if (upload.expiresAt <= now) throw new TaxDocumentUploadExpired();
        if (
          upload.checksum !== inspection.checksum ||
          upload.sizeBytes !== inspection.sizeBytes ||
          upload.contentType !== inspection.contentType
        ) {
          throw new TaxDocumentUploadInvalid(
            'The stored PDF does not match its registered checksum or metadata',
          );
        }
        if (!(await this.tax.attachDocumentUpload(tx, tenantId, upload.id, now))) {
          throw new TaxFilingConcurrentChange();
        }
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
