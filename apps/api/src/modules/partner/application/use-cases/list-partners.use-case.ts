import { Inject, Injectable } from '@nestjs/common';
import type { ListPartnersQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

/** The tenant's partner list / approval queue (filter by status) — §7.3. */
@Injectable()
export class ListPartnersUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    query: ListPartnersQuery,
  ): Promise<{ items: PartnerRecord[]; total: number; counts: Record<string, number> }> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.partners.list(tx, {
        status: query.status,
        q: query.q,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  }
}
