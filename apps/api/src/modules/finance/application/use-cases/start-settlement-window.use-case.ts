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

/** `booking.completed` → freeze on-site collection and open the dispute window. */
@Injectable()
export class StartSettlementWindowUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly policy: GetPayoutPolicyUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    reportedOnsiteCollected?: bigint,
  ): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await loadBookingFinanceView(tx, bookingId);
      if (!booking) {
        throw new FinanceBookingNotFound('Booking not found while opening settlement window');
      }
      const settlement = await this.settlements.ensureHeldForBooking(tx, tenantId, bookingId);
      if (!settlement) throw new HeldSettlementMissing();
      const plan = Settlement.rehydrate(settlement).startCompletionWindow(
        booking,
        reportedOnsiteCollected,
      );
      if (!plan) return;
      const payoutPolicy = await this.policy.execute(tx, tenantId);
      await this.settlements.startDisputeWindow(
        tx,
        bookingId,
        plan.onsiteCollectedAmount,
        payoutPolicy.holdingDays,
        plan.amounts,
      );
    });
  }
}
