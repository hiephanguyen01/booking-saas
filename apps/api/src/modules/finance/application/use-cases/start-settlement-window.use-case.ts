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
        throw new NotFoundException({
          statusCode: 404,
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found while opening settlement window',
        });
      }
      const settlement = await this.settlements.ensureHeldForBooking(tx, tenantId, bookingId);
      if (!settlement) {
        throw new ConflictException({
          statusCode: 409,
          code: 'HELD_SETTLEMENT_MISSING',
          message: 'Successful payment has not created its held settlement yet',
        });
      }
      if (settlement.status !== 'held') return;
      const effectiveFinal = booking.finalAmount + booking.additionalCharges;
      const expectedOnsite =
        effectiveFinal > settlement.onlineHeldAmount
          ? effectiveFinal - settlement.onlineHeldAmount
          : 0n;
      const onsite = reportedOnsiteCollected ?? expectedOnsite;
      if (onsite !== expectedOnsite) {
        throw new ConflictException({
          statusCode: 409,
          code: 'ONSITE_AMOUNT_MISMATCH',
          message: `On-site amount ${onsite} does not match the outstanding ${expectedOnsite}`,
        });
      }
      const payoutPolicy = await this.policy.execute(tx, tenantId);
      const effectiveTotal = booking.totalAmount + booking.additionalCharges;
      const split = computeCommissionSplit({
        totalAmount: effectiveTotal,
        finalAmount: effectiveFinal,
        fundedBy: booking.fundedBy,
        hasAffiliate: booking.affiliateId !== null,
        rates: snapshotToRates(booking.snapshot),
      });
      const partnerBasis = booking.fundedBy === 'tenant' ? effectiveTotal : effectiveFinal;
      const amounts: ReleaseAmounts = {
        tenantCommissionGross: booking.snapshot.isHouse
          ? effectiveFinal
          : partnerBasis - split.partnerShare,
        tenantNetEarning: split.tenantNet,
        partnerGrossEarning: split.partnerShare,
        partnerPayable: split.partnerShare > onsite ? split.partnerShare - onsite : 0n,
        platformFee: split.platformFee,
        affiliateCommission: split.affiliateCommission,
      };
      await this.settlements.startDisputeWindow(
        tx,
        bookingId,
        onsite,
        payoutPolicy.holdingDays,
        amounts,
      );
    });
  }
}
