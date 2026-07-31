import { Inject, Injectable } from '@nestjs/common';
import type { Locale, TenantLegalOverview } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { computeLegalReadiness } from '../../domain/legal-readiness';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';
import { toTenantLegalOverview } from '../legal.mapper';

/** The dashboard's Pháp lý tab read model — all four documents, drafts and history. */
@Injectable()
export class GetTenantLegalUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string): Promise<TenantLegalOverview> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFound();
    const defaultLocale = tenant.defaultLocale as Locale;

    const rows = await this.tenantDb.forTenant(tenantId, (tx) => this.documents.listAll(tx, tenantId));

    // `readyInDefaultLocale` per document comes from the CURRENT version's
    // translations, not the draft's — the draft has not been reviewed by
    // anyone yet.
    const readiness = computeLegalReadiness(
      rows.map((d) => ({
        docType: d.docType,
        publishedLocales:
          d.versions.find((v) => v.id === d.currentVersionId)?.translations.map((t) => t.locale) ?? [],
      })),
      defaultLocale,
    );

    return toTenantLegalOverview(rows, defaultLocale, readiness);
  }
}
