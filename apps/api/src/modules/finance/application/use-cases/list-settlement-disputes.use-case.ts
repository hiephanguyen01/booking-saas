import { Inject, Injectable } from '@nestjs/common';
import type {
  PartnerSettlementDisputesQuery,
  TenantSettlementDisputesQuery,
} from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
  type SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';

@Injectable()
export class ListSettlementDisputesUseCase {
  constructor(
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    query: PartnerSettlementDisputesQuery | TenantSettlementDisputesQuery,
    partnerId?: string,
  ): Promise<RepoPage<SettlementDisputeRecord>> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.disputes.list(tx, query.page, query.pageSize, {
        partnerId: partnerId ?? ('partnerId' in query ? query.partnerId : undefined),
        status: query.status,
        responseStatus: query.responseStatus,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        q: query.q,
      }),
    );
  }
}
