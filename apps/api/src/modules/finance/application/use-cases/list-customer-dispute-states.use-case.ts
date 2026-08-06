import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { Settlement } from '../../domain/entities/settlement.entity';
import { SettlementNotFound } from '../../domain/errors/finance-domain-errors';
import {
  FINANCE_TENANT_HOST_READER,
  type IFinanceTenantHostReader,
} from '../../domain/ports/finance-tenant-host-reader.port';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
} from '../../domain/ports/settlement-dispute-repository.port';

export interface CustomerDisputeStateView {
  bookingId: string;
  canOpenDispute: boolean;
  disputeUntil: Date | null;
}

/**
 * Dispute eligibility across the caller's whole booking history, in one read.
 * The booking list needs it per row to decide whether to offer the button, and
 * asking the per-booking endpoint once per row would be a request per row.
 */
@Injectable()
export class ListCustomerDisputeStatesUseCase {
  constructor(
    @Inject(FINANCE_TENANT_HOST_READER) private readonly tenants: IFinanceTenantHostReader,
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, customerId: string): Promise<CustomerDisputeStateView[]> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw new SettlementNotFound();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const states = await this.disputes.listCustomerStates(tx, customerId);
      const now = await this.tenantDb.databaseNow(tx);
      return states.map((state) => ({
        bookingId: state.bookingId,
        canOpenDispute: Settlement.allowsDispute(state, now, state.hasDispute),
        disputeUntil: state.disputeUntil,
      }));
    });
  }
}
