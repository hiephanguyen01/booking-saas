import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentResponse, LegalDocumentType, Locale } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { LegalDocumentNotFound } from '../../domain/errors/legal-errors';
import { resolveLegalLocale } from '../../domain/locale-resolution';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';
import { toLegalDocumentResponse } from '../legal.mapper';

/**
 * The storefront's public document page. A draft is never reachable here —
 * with no `versionNo`, only the document's `currentVersionId` is served; a
 * `versionNo` fetches a specific superseded (still published) version for the
 * account page's "read what I accepted" link, never the draft.
 */
@Injectable()
export class GetPublicLegalDocumentUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    docType: LegalDocumentType,
    requestedLocale: Locale,
    versionNo?: number,
  ): Promise<LegalDocumentResponse> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFound();
    const defaultLocale = tenant.defaultLocale as Locale;

    const doc = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.documents.findByType(tx, tenantId, docType),
    );
    if (!doc) throw new LegalDocumentNotFound();

    const version = versionNo
      ? doc.versions.find((v) => v.versionNo === versionNo && v.publishedAt !== null)
      : doc.versions.find((v) => v.id === doc.currentVersionId);
    if (!version) throw new LegalDocumentNotFound();

    const resolved = resolveLegalLocale(
      requestedLocale,
      defaultLocale,
      version.translations.map((t) => t.locale),
    );
    const translation = version.translations.find((t) => t.locale === resolved.locale);
    if (!translation) throw new LegalDocumentNotFound();

    return toLegalDocumentResponse(docType, version, requestedLocale, resolved, translation);
  }
}
