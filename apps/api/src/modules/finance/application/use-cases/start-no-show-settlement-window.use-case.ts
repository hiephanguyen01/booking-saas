import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';
import { loadBookingFinanceView } from '../booking-finance-view';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import { Settlement } from '../../domain/entities/settlement.entity';
import {
  FinanceBookingNotFound,
  HeldSettlementMissing,
} from '../../domain/errors/finance-domain-errors';
import { RecordSettlementWithholdingUseCase } from './record-settlement-withholding.use-case';

/**
 * `booking.no_show` assesses partner tax on the retained amount and opens a
 * dispute window; it never recognizes revenue immediately. Same rule as a normal
 * completion: the transaction is accepted here, so tax is assessed here.
 */
@Injectable()
export class StartNoShowSettlementWindowUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly policy: GetPayoutPolicyUseCase,
    private readonly recordWithholding: RecordSettlementWithholdingUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await loadBookingFinanceView(tx, bookingId);
      if (!booking) {
        throw new FinanceBookingNotFound(
          'Booking not found while opening the no-show settlement window',
        );
      }
      const settlement = await this.settlements.ensureHeldForBooking(tx, tenantId, bookingId);
      if (!settlement) throw new HeldSettlementMissing();
      const plan = Settlement.rehydrate(settlement).startNoShowWindow(booking);
      if (!plan) return;
      const payoutPolicy = await this.policy.execute(tx, tenantId);
      const opened = await this.settlements.startDisputeWindow(
        tx,
        bookingId,
        plan.onsiteCollectedAmount,
        payoutPolicy.holdingDays,
        plan.amounts,
        plan.kind,
      );
      if (!opened) return;
      await this.recordWithholding.execute(tx, tenantId, opened, plan.taxRevenueAmount);
    });
  }
}
