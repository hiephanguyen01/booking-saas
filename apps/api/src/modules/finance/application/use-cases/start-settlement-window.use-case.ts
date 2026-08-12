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
 * `booking.completed` → freeze on-site collection, assess partner tax, and open
 * the dispute window.
 *
 * Confirmed service completion is what this product treats as the platform
 * accepting the transaction, so it is the tax trigger (NĐ 117/2025 Đ.5 — the
 * mapping still needs Tax Counsel sign-off, see docs/features/vat.md). The
 * dispute window that opens here governs only when the partner's money becomes
 * payable; it must never gate whether tax was assessed.
 */
@Injectable()
export class StartSettlementWindowUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly policy: GetPayoutPolicyUseCase,
    private readonly recordWithholding: RecordSettlementWithholdingUseCase,
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
      const opened = await this.settlements.startDisputeWindow(
        tx,
        bookingId,
        plan.onsiteCollectedAmount,
        payoutPolicy.holdingDays,
        plan.amounts,
      );
      if (!opened) return;
      await this.recordWithholding.execute(tx, tenantId, opened, plan.taxRevenueAmount);
    });
  }
}
