import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
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

  execute(tenantId: string): Promise<PayoutRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.payouts.list(tx));
  }
}
