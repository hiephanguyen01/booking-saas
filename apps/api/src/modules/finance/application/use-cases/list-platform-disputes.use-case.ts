import { Inject, Injectable } from '@nestjs/common';
import type { AdminSettlementDisputesQuery } from '@booking/contracts';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
  type SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';

@Injectable()
export class ListPlatformDisputesUseCase {
  constructor(
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
  ) {}

  execute(
    query: AdminSettlementDisputesQuery,
  ): Promise<{ items: SettlementDisputeRecord[]; total: number }> {
    return this.disputes.listPlatform(query.page, query.pageSize, {
      tenantId: query.tenantId,
      status: query.status,
      responseStatus: query.responseStatus,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      q: query.q,
    });
  }
}
