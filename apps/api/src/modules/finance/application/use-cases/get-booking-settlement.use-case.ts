import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type SettlementRecord,
} from '../../domain/ports/settlement-repository.port';

/** Read one settlement, optionally enforcing partner ownership. */
@Injectable()
export class GetBookingSettlementUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    bookingId: string,
    partnerId?: string,
  ): Promise<SettlementRecord | null> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const settlement = await this.settlements.findByBooking(tx, bookingId);
      return settlement && (!partnerId || settlement.partnerId === partnerId) ? settlement : null;
    });
  }
}
