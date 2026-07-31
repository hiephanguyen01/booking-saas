import { Inject, Injectable } from '@nestjs/common';
import type { PartnerAgreementResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AGREEMENT_REPOSITORY,
  type IAgreementRepository,
} from '../../domain/ports/agreement-repository.port';

@Injectable()
export class ListPartnerAgreementsUseCase {
  constructor(
    @Inject(AGREEMENT_REPOSITORY) private readonly agreements: IAgreementRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, partnerId: string): Promise<PartnerAgreementResponse[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await this.agreements.listByPartner(tx, partnerId);
      return rows.map((row) => ({
        // listByPartner is filtered by partnerId, and record() requires a partnerId, so a
        // row here is always partner_terms/commission_schedule/promo_funding — the tenant
        // legal-document types (customer_terms/privacy_policy/affiliate_terms) are recorded
        // without a partnerId. AgreementTypeKey was widened to match the Prisma enum
        // (§ tenant legal documents); this contract's response shape was not.
        agreementType: row.agreementType as PartnerAgreementResponse['agreementType'],
        version: row.version,
        acceptedAt: row.acceptedAt.toISOString(),
      }));
    });
  }
}
