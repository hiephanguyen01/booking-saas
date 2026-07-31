import { Inject, Injectable } from '@nestjs/common';
import type { AcceptanceRecord } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AGREEMENT_ACCEPTANCE_REPOSITORY,
  type IAgreementAcceptanceRepository,
} from '../../domain/ports/agreement-acceptance-repository.port';
import { toAcceptanceRecord } from '../legal.mapper';

/**
 * Replaces the deleted `partner/ListPartnerAgreementsUseCase` — same response
 * shape (`AcceptanceRecord`, which `PartnerAgreementResponse` now aliases) so
 * `GET /partner/profile/agreements` (`apps/dashboard/.../profile.tsx:45`)
 * keeps working unchanged.
 */
@Injectable()
export class ListPartnerAcceptancesUseCase {
  constructor(
    @Inject(AGREEMENT_ACCEPTANCE_REPOSITORY) private readonly acceptances: IAgreementAcceptanceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, partnerId: string): Promise<AcceptanceRecord[]> {
    const rows = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.acceptances.listByPartner(tx, partnerId),
    );
    return rows.map(toAcceptanceRecord);
  }
}
