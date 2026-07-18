import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type ReleaseAmounts,
} from '../../domain/ports/settlement-repository.port';
import { computeCommissionSplit } from '../../domain/commission-split';
import { snapshotToRates } from '../../domain/commission-snapshot';
import { loadBookingFinanceView } from '../booking-finance-view';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';

/** `booking.no_show` opens a dispute window; it never recognizes revenue immediately. */
@Injectable()
export class StartNoShowSettlementWindowUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly policy: GetPayoutPolicyUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await loadBookingFinanceView(tx, bookingId);
      if (!booking) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found while opening the no-show settlement window',
        });
      }
      const settlement = await this.settlements.findByBooking(tx, bookingId);
      if (!settlement) {
        throw new ConflictException({
          statusCode: 409,
          code: 'HELD_SETTLEMENT_MISSING',
          message: 'Successful payment has not created its held settlement yet',
        });
      }
      if (settlement.status !== 'held') return;

      // The refundable security deposit is not forfeited service revenue.
      const commissionBase = settlement.onlineHeldAmount;
      const split = computeCommissionSplit({
        totalAmount: commissionBase,
        finalAmount: commissionBase,
        fundedBy: null,
        hasAffiliate: booking.affiliateId !== null,
        rates: snapshotToRates(booking.snapshot),
      });
      const amounts: ReleaseAmounts = {
        tenantCommissionGross: booking.snapshot.isHouse
          ? commissionBase
          : commissionBase - split.partnerShare,
        tenantNetEarning: split.tenantNet,
        partnerGrossEarning: split.partnerShare,
        partnerPayable: split.partnerShare,
        platformFee: split.platformFee,
        affiliateCommission: split.affiliateCommission,
      };
      const payoutPolicy = await this.policy.execute(tx, tenantId);
      await this.settlements.startDisputeWindow(
        tx,
        bookingId,
        0n,
        payoutPolicy.holdingDays,
        amounts,
        'customer_no_show',
      );
    });
  }
}
