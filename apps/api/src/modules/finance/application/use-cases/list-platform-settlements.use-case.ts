import { Inject, Injectable } from '@nestjs/common';
import type { BookingSettlementsQuery } from '@booking/contracts';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type SettlementRecord,
} from '../../domain/ports/settlement-repository.port';

@Injectable()
export class ListPlatformSettlementsUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
  ) {}

  execute(
    query: BookingSettlementsQuery,
  ): Promise<RepoPage<SettlementRecord>> {
    return this.settlements.listPlatform(query.page, query.pageSize, {
      status: query.status,
      partnerId: query.partnerId,
    });
  }
}
