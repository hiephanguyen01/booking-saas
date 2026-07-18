import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
} from '../../domain/ports/ledger-repository.port';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type ReleaseAmounts,
} from '../../domain/ports/settlement-repository.port';
import {
  buildCancellationFeeJournal,
  buildRevenueJournal,
  hasRevenueJournal,
} from '../../domain/ledger-journal';
import { computeCommissionSplit } from '../../domain/commission-split';
import { snapshotToRates } from '../../domain/commission-snapshot';
import { loadBookingFinanceView } from '../booking-finance-view';

/** Release one due settlement and atomically recognize earnings/payables. */
@Injectable()
export class ReleaseSettlementUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, settlementId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const settlement = await this.settlements.findById(tx, settlementId);
      if (!settlement) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'SETTLEMENT_NOT_FOUND',
          message: 'Settlement not found',
        });
      }
      if (settlement.status !== 'dispute_window') return;
      const booking = await loadBookingFinanceView(tx, settlement.bookingId);
      if (!booking) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found while releasing settlement',
        });
      }
      const existing = await this.ledger.entriesForBooking(tx, booking.id);
      if (hasRevenueJournal(existing)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'SETTLEMENT_JOURNAL_EXISTS',
          message: 'Booking already has a revenue journal',
        });
      }

      if (settlement.kind === 'cancellation_fee') {
        const retained = settlement.retainedAmount || settlement.onlineHeldAmount;
        const amounts: ReleaseAmounts = {
          tenantCommissionGross: retained,
          tenantNetEarning: retained,
          partnerGrossEarning: 0n,
          partnerPayable: 0n,
          platformFee: 0n,
          affiliateCommission: 0n,
        };
        const journalId = await this.ledger.recordJournal(
          tx,
          tenantId,
          buildCancellationFeeJournal({ tenantId, retained }),
          {
            bookingId: booking.id,
            paymentId: settlement.paymentId,
            memo: 'settlement.cancellation_fee.released',
          },
        );
        const released = await this.settlements.markReleased(
          tx,
          settlement.id,
          journalId,
          amounts,
        );
        if (!released) {
          throw new ConflictException({
            statusCode: 409,
            code: 'SETTLEMENT_NOT_RELEASABLE',
            message: 'Settlement is not due or was concurrently changed',
          });
        }
        return;
      }

      const noShow = settlement.kind === 'customer_no_show';
      const refunded = settlement.refundedAmount;
      const effectiveFinal = noShow
        ? max0(settlement.onlineHeldAmount - refunded)
        : max0(booking.finalAmount + booking.additionalCharges - refunded);
      const effectiveTotal = noShow
        ? effectiveFinal
        : max0(booking.totalAmount + booking.additionalCharges - refunded);
      const split = computeCommissionSplit({
        totalAmount: effectiveTotal,
        finalAmount: effectiveFinal,
        fundedBy: noShow ? null : booking.fundedBy,
        hasAffiliate: booking.affiliateId !== null,
        rates: snapshotToRates(booking.snapshot),
      });
      const partnerBasis = !noShow && booking.fundedBy === 'tenant' ? effectiveTotal : effectiveFinal;
      const tenantCommissionGross = booking.snapshot.isHouse
        ? effectiveFinal
        : partnerBasis - split.partnerShare;
      const partnerPayable =
        split.partnerShare > settlement.onsiteCollectedAmount
          ? split.partnerShare - settlement.onsiteCollectedAmount
          : 0n;
      const amounts: ReleaseAmounts = {
        tenantCommissionGross,
        tenantNetEarning: split.tenantNet,
        partnerGrossEarning: split.partnerShare,
        partnerPayable,
        platformFee: split.platformFee,
        affiliateCommission: split.affiliateCommission,
      };
      const legs = buildRevenueJournal({
        tenantId,
        partnerId: booking.partnerId,
        affiliateId: booking.affiliateId,
        isHouse: booking.snapshot.isHouse,
        commissionBase: effectiveFinal,
        cashViaGateway: max0(settlement.onlineHeldAmount - refunded),
        additionalCharges: noShow ? 0n : booking.additionalCharges,
        split,
        cashEntryType: 'booking_revenue',
      });
      const journalId = await this.ledger.recordJournal(tx, tenantId, legs, {
        bookingId: booking.id,
        paymentId: settlement.paymentId,
        memo: 'settlement.released',
      });
      const released = await this.settlements.markReleased(tx, settlement.id, journalId, amounts);
      if (!released) {
        throw new ConflictException({
          statusCode: 409,
          code: 'SETTLEMENT_NOT_RELEASABLE',
          message: 'Settlement is not due or was concurrently changed',
        });
      }
    });
  }
}

function max0(value: bigint): bigint {
  return value > 0n ? value : 0n;
}
