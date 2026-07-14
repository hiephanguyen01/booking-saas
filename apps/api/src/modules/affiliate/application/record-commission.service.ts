import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService, type PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { defaultCommissionSnapshot, type CommissionSnapshot } from '../../finance/domain/commission-snapshot';
import { computeAffiliateCommission } from '../domain/affiliate-commission-amount';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type IAffiliateCommissionRepository,
} from '../domain/ports/affiliate-commission-repository.port';

interface BookingFinanceView {
  affiliateId: string;
  totalAmount: bigint;
  finalAmount: bigint;
  additionalCharges: bigint;
  snapshot: CommissionSnapshot;
  fundedBy: 'tenant' | 'partner' | null;
}

/**
 * Drives the `affiliate_commissions` lifecycle off booking outbox events (§7.8):
 *   confirmed → `pending`; completed → `confirmed`; cancelled/rejected/expired →
 *   `reversed`; post-completion dispute → `clawed_back`; payout settled → `paid`.
 *
 * Amounts are replayed from the booking's frozen `commission_snapshot` via the
 * shared finance split maths, so a commission always equals its ledger leg. Every
 * method is idempotent (the row is keyed by the unique `booking_id`) and opens its
 * own `forTenant` tx — outbox handlers carry no request context.
 */
@Injectable()
export class RecordCommissionService {
  constructor(
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  /** booking.confirmed → open a `pending` commission on final_amount (no charges yet). */
  async recordPending(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.loadBooking(tx, bookingId);
      if (!booking) return;
      const existing = await this.commissions.findByBooking(tx, bookingId);
      // Never resurrect a terminal commission (reversed/paid/clawed_back) on redelivery.
      if (existing && existing.status !== 'pending') return;
      const amount = computeAffiliateCommission({
        snapshot: booking.snapshot,
        totalAmount: booking.totalAmount,
        finalAmount: booking.finalAmount,
        additionalCharges: 0n,
        fundedBy: booking.fundedBy,
      });
      await this.commissions.upsert(tx, tenantId, {
        affiliateId: booking.affiliateId,
        bookingId,
        amount,
        status: 'pending',
      });
    });
  }

  /** booking.completed → confirm the commission on final + additional charges. */
  async recordConfirmed(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.loadBooking(tx, bookingId);
      if (!booking) return;
      const existing = await this.commissions.findByBooking(tx, bookingId);
      if (existing && existing.status !== 'pending' && existing.status !== 'confirmed') return;
      const amount = computeAffiliateCommission({
        snapshot: booking.snapshot,
        totalAmount: booking.totalAmount,
        finalAmount: booking.finalAmount,
        additionalCharges: booking.additionalCharges,
        fundedBy: booking.fundedBy,
      });
      await this.commissions.upsert(tx, tenantId, {
        affiliateId: booking.affiliateId,
        bookingId,
        amount,
        status: 'confirmed',
      });
    });
  }

  /** booking.cancelled/rejected/expired (pre-completion) → reverse a not-yet-paid commission. */
  async reverse(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.commissions.findByBooking(tx, bookingId);
      if (!existing) return;
      if (existing.status === 'pending' || existing.status === 'confirmed') {
        await this.commissions.updateForBooking(tx, bookingId, { status: 'reversed' });
      }
    });
  }

  /** Post-completion dispute (booking.refunded) → claw back a confirmed/paid commission. */
  async clawback(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.commissions.findByBooking(tx, bookingId);
      if (!existing) return;
      if (existing.status === 'confirmed' || existing.status === 'paid') {
        await this.commissions.updateForBooking(tx, bookingId, { status: 'clawed_back' });
      }
    });
  }

  /** payout.paid (payeeType=affiliate) → the affiliate's confirmed commissions become `paid`. */
  async markPaid(tenantId: string, affiliateId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, (tx) => this.commissions.markConfirmedPaid(tx, affiliateId));
  }

  private async loadBooking(tx: PrismaTx, bookingId: string): Promise<BookingFinanceView | null> {
    const b = await tx.booking.findUnique({
      where: { id: bookingId },
      select: {
        affiliateId: true,
        partnerId: true,
        totalAmount: true,
        finalAmount: true,
        additionalCharges: true,
        commissionSnapshot: true,
        promotionSnapshot: true,
        discountAmount: true,
      },
    });
    if (!b || !b.affiliateId) return null;

    let snapshot = b.commissionSnapshot as CommissionSnapshot | null;
    if (!snapshot) {
      const partner = await tx.partner.findUnique({ where: { id: b.partnerId }, select: { isHouse: true } });
      snapshot = defaultCommissionSnapshot(partner?.isHouse ?? false);
    }
    const promo = b.promotionSnapshot as { fundedBy?: 'tenant' | 'partner' } | null;
    const fundedBy = b.discountAmount > 0n ? (promo?.fundedBy ?? null) : null;

    return {
      affiliateId: b.affiliateId,
      totalAmount: b.totalAmount,
      finalAmount: b.finalAmount,
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
