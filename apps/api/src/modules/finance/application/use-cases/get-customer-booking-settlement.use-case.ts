import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FINANCE_TENANT_HOST_READER,
  type IFinanceTenantHostReader,
} from '../../domain/ports/finance-tenant-host-reader.port';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
  type SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type SettlementRecord,
} from '../../domain/ports/settlement-repository.port';

export interface CustomerBookingSettlementView {
  settlement: SettlementRecord;
  dispute: SettlementDisputeRecord | null;
}

/** Read the customer-safe settlement projection after verifying host and ownership. */
@Injectable()
export class GetCustomerBookingSettlementUseCase {
  constructor(
    @Inject(FINANCE_TENANT_HOST_READER) private readonly tenants: IFinanceTenantHostReader,
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    bookingId: string,
  ): Promise<CustomerBookingSettlementView> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw this.notFound();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (!(await this.disputes.customerOwnsBooking(tx, bookingId, customerId))) {
        throw this.notFound();
      }
      const settlement = await this.settlements.findByBooking(tx, bookingId);
      if (!settlement) throw this.notFound();
      const dispute = await this.disputes.findLatestBySettlement(tx, settlement.id);
      return { settlement, dispute };
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      code: 'SETTLEMENT_NOT_FOUND',
      message: 'Settlement not found',
    });
  }
}
