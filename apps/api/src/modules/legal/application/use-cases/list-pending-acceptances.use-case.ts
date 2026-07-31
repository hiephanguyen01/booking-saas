import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentType, Locale, PendingAcceptance } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { resolveLegalLocale } from '../../domain/locale-resolution';
import {
  AGREEMENT_ACCEPTANCE_REPOSITORY,
  type IAgreementAcceptanceRepository,
} from '../../domain/ports/agreement-acceptance-repository.port';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';
import { toPendingAcceptance } from '../legal.mapper';

export type PendingAcceptanceScope = 'partner' | 'affiliate' | 'customer';

/** Which required documents gate which principal type. */
const SCOPE_TYPES: Record<PendingAcceptanceScope, readonly LegalDocumentType[]> = {
  partner: ['partner_terms'],
  affiliate: ['affiliate_terms'],
  customer: ['customer_terms', 'privacy_policy'],
};

/**
 * Backs `GET /me/legal/pending` and `RequireCurrentAgreementGuard`: the
 * documents this user must (re-)accept before writing in the given area.
 */
@Injectable()
export class ListPendingAcceptancesUseCase {
  constructor(
    @Inject(AGREEMENT_ACCEPTANCE_REPOSITORY) private readonly acceptances: IAgreementAcceptanceRepository,
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  /**
   * `partnerId` narrows a `'partner'`-scope check to one partner organisation
   * (D-Task6-1) — without it, a user who belongs to more than one partner org
   * would have their pending check answered against *any* of their partner
   * acceptances, not the one they are currently acting as. Pass it whenever the
   * caller has a verified partner scope (e.g. `RequireCurrentAgreementGuard`);
   * omit it for a user-wide check (e.g. `GET /me/legal/pending`, which has no
   * single verified partner scope to narrow to).
   */
  async execute(
    tenantId: string,
    userId: string,
    scope: PendingAcceptanceScope,
    partnerId?: string | null,
  ): Promise<PendingAcceptance[]> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFound();
    const defaultLocale = tenant.defaultLocale as Locale;
    const types = SCOPE_TYPES[scope];

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const pending = await this.acceptances.pendingTypes(tx, userId, types, partnerId);
      const result: PendingAcceptance[] = [];
      for (const row of pending) {
        const version = await this.documents.findVersionById(tx, row.versionId);
        if (!version) continue;
        const resolved = resolveLegalLocale(
          defaultLocale,
          defaultLocale,
          version.translations.map((t) => t.locale),
        );
        const translation = version.translations.find((t) => t.locale === resolved.locale);
        if (!translation) continue;
        result.push(toPendingAcceptance(row, translation, resolved.locale));
      }
      return result;
    });
  }
}
