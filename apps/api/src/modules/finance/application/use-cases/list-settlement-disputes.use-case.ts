import { Inject, Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
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
    query: PaginationQuery,
    partnerId?: string,
  ): Promise<{ items: SettlementDisputeRecord[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.disputes.list(tx, query.page, query.pageSize, partnerId),
    );
  }
}
