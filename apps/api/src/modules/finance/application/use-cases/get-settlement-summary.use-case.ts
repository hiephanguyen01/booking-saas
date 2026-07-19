import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type SettlementSummary,
} from '../../domain/ports/settlement-repository.port';

@Injectable()
export class GetSettlementSummaryUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId?: string): Promise<SettlementSummary> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.settlements.summarize(tx, partnerId));
  }
}
