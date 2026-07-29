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
        agreementType: row.agreementType,
        version: row.version,
        acceptedAt: row.acceptedAt.toISOString(),
      }));
    });
  }
}
