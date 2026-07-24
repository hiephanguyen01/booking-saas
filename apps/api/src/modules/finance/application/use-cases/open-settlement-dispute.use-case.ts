import { Inject, Injectable } from '@nestjs/common';
import type { OpenSettlementDisputeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
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
} from '../../domain/ports/settlement-repository.port';
import { SettlementDispute } from '../../domain/entities/settlement-dispute.entity';
import {
  CustomerBookingNotFound,
  FinanceTenantNotFound,
  SettlementNotFound,
} from '../../domain/errors/finance-domain-errors';

/** Customer opens a claim only for their booking and before the DB deadline. */
@Injectable()
export class OpenSettlementDisputeUseCase {
  constructor(
    @Inject(FINANCE_TENANT_HOST_READER) private readonly tenants: IFinanceTenantHostReader,
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    input: OpenSettlementDisputeInput,
  ): Promise<SettlementDisputeRecord> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw new FinanceTenantNotFound();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (!(await this.disputes.customerOwnsBooking(tx, input.bookingId, customerId))) {
        throw new CustomerBookingNotFound();
      }
      const settlement = await this.settlements.findByBooking(tx, input.bookingId);
      if (!settlement) throw new SettlementNotFound();
      const existing = await this.disputes.findLatestBySettlement(tx, settlement.id);
      const classified = SettlementDispute.classifyExisting(existing);
      if (classified) return classified;
      SettlementDispute.assertWindowOpened(await this.settlements.markDisputed(tx, settlement.id));
      const dispute = await this.disputes.create(tx, tenantId, {
        settlementId: settlement.id,
        bookingId: input.bookingId,
        openedByUserId: customerId,
        openedByRole: 'customer',
        reason: input.reason,
        evidence: input.evidence,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'settlement.dispute_opened',
        payload: {
          disputeId: dispute.id,
          settlementId: settlement.id,
          bookingId: input.bookingId,
        },
      });
      return dispute;
    });
  }
}
