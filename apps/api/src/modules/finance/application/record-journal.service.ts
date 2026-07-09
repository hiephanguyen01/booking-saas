import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantDbService, type PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { LEDGER_REPOSITORY, type ILedgerRepository } from '../domain/ports/ledger-repository.port';
import { computeCommissionSplit } from '../domain/commission-split';
import {
  buildCancellationFeeJournal,
  buildClawbackJournal,
  buildRevenueJournal,
  type JournalLeg,
} from '../domain/ledger-journal';
import {
  defaultCommissionSnapshot,
  snapshotToRates,
  type CommissionSnapshot,
} from '../domain/commission-snapshot';

interface BookingFinanceView {
  id: string;
  partnerId: string;
  affiliateId: string | null;
  totalAmount: bigint;
  finalAmount: bigint;
  paidAmount: bigint;
  additionalCharges: bigint;
  snapshot: CommissionSnapshot;
  fundedBy: 'tenant' | 'partner' | null;
}

/** Entry types that mark a booking as already having its terminal revenue journal. */
const REVENUE_TYPES = new Set(['booking_revenue', 'partner_share', 'platform_fee', 'cancellation_fee']);

/**
 * Writes the double-entry journals driven by booking lifecycle events (§13). Every
 * method is idempotent — the outbox delivers at least once, so we guard on the
 * existence of the booking's ledger entries before writing. Each method opens its
 * own `forTenant` transaction (outbox handlers have no request context).
 */
@Injectable()
export class RecordJournalService {
  private readonly logger = new Logger(RecordJournalService.name);

  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  /** booking.completed → the commission journal from the frozen snapshot. */
  async recordCompletion(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      if (await this.hasRevenueJournal(tx, bookingId)) return;
      const booking = await this.loadBooking(tx, bookingId);
      if (!booking) return;

      const addl = booking.additionalCharges;
      const effectiveFinal = booking.finalAmount + addl;
      const effectiveTotal = booking.totalAmount + addl;
      const rates = snapshotToRates(booking.snapshot);
      const split = computeCommissionSplit({
        totalAmount: effectiveTotal,
        finalAmount: effectiveFinal,
        fundedBy: booking.fundedBy,
        hasAffiliate: booking.affiliateId !== null,
        rates,
      });
      if (split.flags.length > 0) {
        this.logger.warn(`booking ${bookingId} commission split flags: ${split.flags.join(', ')}`);
      }
      const legs = buildRevenueJournal({
        tenantId,
        partnerId: booking.partnerId,
        affiliateId: booking.affiliateId,
        isHouse: booking.snapshot.isHouse,
        commissionBase: effectiveFinal,
        cashViaGateway: booking.paidAmount,
        additionalCharges: addl,
        split,
        cashEntryType: 'booking_revenue',
      });
      await this.ledger.recordJournal(tx, tenantId, legs, { bookingId, memo: 'booking.completed' });
    });
  }

  /** no_show → the commission journal on the actual forfeited paid_amount (§8.5/§13.1). */
  async recordNoShow(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      if (await this.hasRevenueJournal(tx, bookingId)) return;
      const booking = await this.loadBooking(tx, bookingId);
      if (!booking || booking.paidAmount <= 0n) return;

      const rates = snapshotToRates(booking.snapshot);
      const split = computeCommissionSplit({
        totalAmount: booking.paidAmount,
        finalAmount: booking.paidAmount,
        fundedBy: null,
        hasAffiliate: booking.affiliateId !== null,
        rates,
      });
      const legs = buildRevenueJournal({
        tenantId,
        partnerId: booking.partnerId,
        affiliateId: booking.affiliateId,
        isHouse: booking.snapshot.isHouse,
        commissionBase: booking.paidAmount,
        cashViaGateway: booking.paidAmount,
        additionalCharges: 0n,
        split,
        cashEntryType: 'booking_revenue',
      });
      await this.ledger.recordJournal(tx, tenantId, legs, { bookingId, memo: 'booking.no_show' });
    });
  }

  /**
   * booking.cancelled → a cancellation_fee journal on the retained portion (§13.1):
   * what the customer paid minus what was refunded. No journal on a full refund.
   */
  async recordCancellationFee(tenantId: string, bookingId: string, refundAmount: bigint): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      if (await this.hasRevenueJournal(tx, bookingId)) return;
      const booking = await this.loadBooking(tx, bookingId);
      if (!booking) return;
      const retained = booking.paidAmount - refundAmount;
      const legs = buildCancellationFeeJournal({ tenantId, retained });
      if (legs.length === 0) return;
      await this.ledger.recordJournal(tx, tenantId, legs, { bookingId, memo: 'booking.cancelled' });
    });
  }

  /**
   * Post-completion dispute/refund → a clawback reversing the completion journal
   * (§13.1). Partner/affiliate balances may go negative — recovered next payout.
   */
  async recordClawback(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const entries = await this.ledger.entriesForBooking(tx, bookingId);
      const original = entries.filter((e) => e.entryType !== 'clawback' && e.payoutId === null);
      if (original.length === 0) return; // nothing to reverse
      if (entries.some((e) => e.entryType === 'clawback')) return; // already clawed back
      const legs: JournalLeg[] = buildClawbackJournal(
        original.map((e) => ({
          owner: { ownerType: e.ownerType, ownerId: e.ownerId },
          entryType: e.entryType,
          debit: e.debit,
          credit: e.credit,
        })),
      );
      await this.ledger.recordJournal(tx, tenantId, legs, { bookingId, memo: 'booking.clawback' });
    });
  }

  private async hasRevenueJournal(tx: PrismaTx, bookingId: string): Promise<boolean> {
    const entries = await this.ledger.entriesForBooking(tx, bookingId);
    return entries.some((e) => REVENUE_TYPES.has(e.entryType));
  }

  private async loadBooking(tx: PrismaTx, bookingId: string): Promise<BookingFinanceView | null> {
    const b = await tx.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        partnerId: true,
        affiliateId: true,
        totalAmount: true,
        finalAmount: true,
        paidAmount: true,
        additionalCharges: true,
        commissionSnapshot: true,
        promotionSnapshot: true,
        discountAmount: true,
      },
    });
    if (!b) return null;

    let snapshot = b.commissionSnapshot as CommissionSnapshot | null;
    if (!snapshot) {
      const partner = await tx.partner.findUnique({ where: { id: b.partnerId }, select: { isHouse: true } });
      snapshot = defaultCommissionSnapshot(partner?.isHouse ?? false);
    }
    const promo = b.promotionSnapshot as { fundedBy?: 'tenant' | 'partner' } | null;
    const fundedBy = b.discountAmount > 0n ? (promo?.fundedBy ?? null) : null;

    return {
      id: b.id,
      partnerId: b.partnerId,
      affiliateId: b.affiliateId,
      totalAmount: b.totalAmount,
      finalAmount: b.finalAmount,
      paidAmount: b.paidAmount,
      additionalCharges: sumCharges(b.additionalCharges),
      snapshot,
      fundedBy,
    };
  }
}

/** Sum the `amount` fields of the additional_charges json array (§8.3). */
function sumCharges(raw: unknown): bigint {
  if (!Array.isArray(raw)) return 0n;
  let total = 0n;
  for (const item of raw) {
    const amount = (item as { amount?: unknown })?.amount;
    if (typeof amount === 'number' && Number.isSafeInteger(amount)) total += BigInt(amount);
    else if (typeof amount === 'string' && /^-?\d+$/.test(amount)) total += BigInt(amount);
    else if (typeof amount === 'bigint') total += amount;
  }
  return total > 0n ? total : 0n;
}
