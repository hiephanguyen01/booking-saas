import { Inject, Injectable } from '@nestjs/common';
import type { BookingSettlementsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type SettlementRecord,
} from '../../domain/ports/settlement-repository.port';

/** Tenant settlement register, paginated and RLS-scoped. */
@Injectable()
export class ListBookingSettlementsUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    query: BookingSettlementsQuery,
  ): Promise<{ items: SettlementRecord[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.settlements.list(tx, query.page, query.pageSize, {
        status: query.status,
        partnerId: query.partnerId,
      }),
    );
  }
}
