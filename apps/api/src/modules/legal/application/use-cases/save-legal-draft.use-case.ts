import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentType, SaveLegalDraftInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';

/**
 * Replaces the tenant's draft for one document type. `upsertDraft` replaces
 * the whole draft row, so the caller must always send every locale it wants
 * kept — this is not a partial patch.
 */
@Injectable()
export class SaveLegalDraftUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, docType: LegalDocumentType, input: SaveLegalDraftInput): Promise<void> {
    await this.tenantDb.forTenant(tenantId, (tx) =>
      this.documents.upsertDraft(tx, {
        tenantId,
        docType,
        translations: input.translations,
      }),
    );
  }
}
