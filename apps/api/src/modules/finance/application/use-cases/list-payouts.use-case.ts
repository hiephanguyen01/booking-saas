import { Inject, Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutRecord,
} from '../../domain/ports/payout-repository.port';

/** List a tenant's payout runs (§13.3). */
@Injectable()
export class ListPayoutsUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: IPayoutRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    query: PaginationQuery,
  ): Promise<RepoPage<PayoutRecord>> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.payouts.list(tx, query));
  }
}
