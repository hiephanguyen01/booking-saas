import { Inject, Injectable } from '@nestjs/common';
import type { ListPartnersQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPageWithCounts } from '../../../../shared/pagination/pagination';
import {
  PARTNER_READER,
  type IPartnerReader,
  type PartnerRecord,
} from '../../domain/ports/partner-reader.port';

/** The tenant's partner list / approval queue (filter by status) — §7.3. */
@Injectable()
export class ListPartnersUseCase {
  constructor(
    @Inject(PARTNER_READER) private readonly partners: IPartnerReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    query: ListPartnersQuery,
  ): Promise<RepoPageWithCounts<PartnerRecord>> {
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
