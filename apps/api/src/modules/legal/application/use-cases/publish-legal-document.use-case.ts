import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentType, Locale, PublishLegalDocumentInput } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { LegalDocument } from '../../domain/entities/legal-document.entity';
import { LegalDocumentNotFound, LegalDraftMissing } from '../../domain/errors/legal-errors';
import { computeLegalReadiness } from '../../domain/legal-readiness';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';

/**
 * Publishes the tenant's draft for one document type. Load → assert → publish
 * → recompute readiness, all inside one `forTenant` transaction so a partial
 * publish (published but readiness un-recomputed) can never be observed.
 */
@Injectable()
export class PublishLegalDocumentUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    docType: LegalDocumentType,
    input: PublishLegalDocumentInput,
    ctx: { userId: string },
  ): Promise<void> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFound();
    const defaultLocale = tenant.defaultLocale as Locale;

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const doc = await this.documents.findByType(tx, tenantId, docType);
      if (!doc) throw new LegalDocumentNotFound();
      const draft = doc.versions.find((v) => v.publishedAt === null);
      if (!draft) throw new LegalDraftMissing();

      LegalDocument.assertPublishable(
        draft.translations.map((t) => t.locale),
        defaultLocale,
      );

      const versionNo = LegalDocument.nextVersionNo(
        doc.versions
          .filter((v) => v.publishedAt !== null)
          .map((v) => ({
            versionNo: v.versionNo,
            publishedAt: v.publishedAt,
            isMaterialChange: v.isMaterialChange,
            locales: v.translations.map((t) => t.locale),
          })),
      );

      await this.documents.publish(tx, {
        tenantId,
        documentId: doc.id,
        draftVersionId: draft.id,
        versionNo,
        isMaterialChange: input.material,
        publishedByUserId: ctx.userId,
      });

      // A material change moves the re-acceptance bar for every partner/
      // affiliate — notification mails them (Task 20). A cosmetic fix (typo,
      // formatting) creates a version too but nobody has to sign again.
      if (input.material) {
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'legal.document_published',
          payload: { docType, versionId: draft.id, versionNo, isMaterialChange: true },
        });
      }

      await this.emitReadiness(tx, tenantId, defaultLocale);
    });
  }

  /**
   * Readiness is computed HERE, in the module that owns the documents, and
   * shipped as a boolean + count in the payload. tenancy's handler then writes
   * two columns and imports nothing from legal — which is what keeps
   * `pnpm check:module-cycles` green, since legal already imports tenancy.
   */
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
