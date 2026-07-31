import { Inject, Injectable } from '@nestjs/common';
import type { Locale } from '@booking/contracts';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';

/** Both locales the shipped templates cover — a fresh tenant starts with both drafted, publishes what it needs. */
const SEED_LOCALES: readonly Locale[] = ['vi', 'en'];

/**
 * Seeds the four required documents as drafts from `LEGAL_TEMPLATES`. Called
 * by the demo seed directly, and by `legal`'s own `tenant.created` outbox
 * handler for a freshly created tenant (D10 — `tenancy` cannot call this
 * synchronously without creating a `tenancy → legal` cycle, since
 * `legal → tenancy` already exists).
 *
 * Accepts an optional `tx` so a caller that already holds one (e.g. a seed
 * script running inside its own transaction) can pass it through instead of
 * nesting `forTenant`; without one, this opens its own.
 */
@Injectable()
export class SeedTenantLegalDraftsUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, tx?: PrismaTx): Promise<void> {
    if (tx) {
      await this.documents.seedDrafts(tx, tenantId, SEED_LOCALES);
      return;
    }
    await this.tenantDb.forTenant(tenantId, (innerTx) =>
      this.documents.seedDrafts(innerTx, tenantId, SEED_LOCALES),
    );
  }
}
