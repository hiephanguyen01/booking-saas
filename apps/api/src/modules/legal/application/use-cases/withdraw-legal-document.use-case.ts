import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentType, Locale } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { LegalDocumentNotFound } from '../../domain/errors/legal-errors';
import { computeLegalReadiness } from '../../domain/legal-readiness';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';

/**
 * The mirror image of {@link PublishLegalDocumentUseCase}: clears
 * `currentVersionId` (never deletes versions — history stays intact for
 * anyone who already accepted it) and recomputes readiness in the same
 * transaction. `emitReadiness` is duplicated here rather than shared via a
 * service class (ADR 0006) — the small duplication is the sanctioned
 * trade-off per the plan.
 */
@Injectable()
export class WithdrawLegalDocumentUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, docType: LegalDocumentType): Promise<void> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFound();
    const defaultLocale = tenant.defaultLocale as Locale;

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const doc = await this.documents.findByType(tx, tenantId, docType);
      if (!doc) throw new LegalDocumentNotFound();

      await this.documents.withdraw(tx, tenantId, doc.id);
      await this.emitReadiness(tx, tenantId, defaultLocale);
    });
  }

  private async emitReadiness(tx: PrismaTx, tenantId: string, defaultLocale: Locale): Promise<void> {
    const all = await this.documents.listAll(tx, tenantId);
    const readiness = computeLegalReadiness(
      all.map((d) => ({
        docType: d.docType,
        publishedLocales:
          d.versions.find((v) => v.id === d.currentVersionId)?.translations.map((t) => t.locale) ?? [],
      })),
      defaultLocale,
    );
    await this.outbox.emit(tx, {
      tenantId,
      eventType: 'legal.readiness_changed',
      payload: { legalReady: readiness.legalReady, publishedCount: readiness.publishedCount },
    });
  }
}
