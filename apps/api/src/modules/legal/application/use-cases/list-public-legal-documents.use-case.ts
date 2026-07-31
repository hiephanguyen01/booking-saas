import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentSummary, Locale } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { resolveLegalLocale } from '../../domain/locale-resolution';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';
import { toLegalDocumentResponse, toLegalDocumentSummary } from '../legal.mapper';

/** Storefront footer link data — published documents only, same locale rule as the single-document read. */
@Injectable()
export class ListPublicLegalDocumentsUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, requestedLocale: Locale): Promise<LegalDocumentSummary[]> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFound();
    const defaultLocale = tenant.defaultLocale as Locale;

    const rows = await this.tenantDb.forTenant(tenantId, (tx) => this.documents.listAll(tx, tenantId));

    const summaries: LegalDocumentSummary[] = [];
    for (const doc of rows) {
      if (!doc.currentVersionId) continue;
      const version = doc.versions.find((v) => v.id === doc.currentVersionId);
      if (!version) continue;
      const resolved = resolveLegalLocale(
        requestedLocale,
        defaultLocale,
        version.translations.map((t) => t.locale),
      );
      const translation = version.translations.find((t) => t.locale === resolved.locale);
      if (!translation) continue;
      summaries.push(
        toLegalDocumentSummary(
          toLegalDocumentResponse(doc.docType, version, requestedLocale, resolved, translation),
        ),
      );
    }
    return summaries;
  }
}
