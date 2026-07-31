import { Inject, Injectable } from '@nestjs/common';
import type { Locale } from '@booking/contracts';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { LegalVersionStale } from '../../domain/errors/legal-errors';
import {
  AGREEMENT_ACCEPTANCE_REPOSITORY,
  type IAgreementAcceptanceRepository,
} from '../../domain/ports/agreement-acceptance-repository.port';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';

export interface RecordLegalAcceptanceArgs {
  tenantId: string;
  userId: string;
  partnerId?: string | null;
  acceptedVersionIds: readonly string[];
  acceptedLocale: Locale;
  ip?: string | null;
}

/**
 * The shared writer every consent surface (partner application, affiliate
 * application, checkout, registration, and the `me/legal` self-service accept
 * screen) calls.
 *
 * Every currently-planned module caller (partner/affiliate application,
 * checkout) already holds an **existing** `tx` from its own `forTenant` and
 * must pass it — the acceptance row commits atomically with the state change
 * it authorizes. `MeLegalController`'s `POST /me/legal/accept` is a standalone
 * business operation with no wrapping transaction of its own, and a controller
 * may not open one directly (`TenantDbService` is not on the controller
 * injection allow-list) — so `tx` is `null` there, and this use-case opens its
 * own `forTenant`, mirroring `SeedTenantLegalDraftsUseCase`'s optional-tx shape.
 */
@Injectable()
export class RecordLegalAcceptanceUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(AGREEMENT_ACCEPTANCE_REPOSITORY) private readonly acceptances: IAgreementAcceptanceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tx: PrismaTx | null, args: RecordLegalAcceptanceArgs): Promise<void> {
    if (tx) {
      await this.recordWithin(tx, args);
      return;
    }
    await this.tenantDb.forTenant(args.tenantId, (innerTx) => this.recordWithin(innerTx, args));
  }

  private async recordWithin(tx: PrismaTx, args: RecordLegalAcceptanceArgs): Promise<void> {
    for (const versionId of args.acceptedVersionIds) {
      const version = await this.documents.findVersionById(tx, versionId);
      if (!version || version.publishedAt === null) throw new LegalVersionStale();
      const doc = await this.documents.findByType(tx, args.tenantId, version.docType);
      // A stale tab must not produce a signature for text nobody saw.
      if (!doc || doc.currentVersionId !== versionId) throw new LegalVersionStale();
      await this.acceptances.record(tx, {
        tenantId: args.tenantId,
        userId: args.userId,
        partnerId: args.partnerId ?? null,
        agreementType: version.docType,
        documentVersionId: versionId,
        acceptedLocale: args.acceptedLocale,
        version: String(version.versionNo),
        ip: args.ip ?? null,
      });
    }
  }
}
