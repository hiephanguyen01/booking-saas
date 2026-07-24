/**
 * PromoRedemption aggregate (§12.3/§12.5) — one customer's claimed use of one
 * promotion, strictly 1:1 with a booking (the `promo_redemptions(booking_id)` unique
 * index is what makes that true).
 *
 * Lifecycle:  reserved ──booking.confirmed──▶ applied
 *                │                              │
 *                └──expired/rejected/100%-cancel─┴──▶ released  (frees one usage)
 *
 * Owns: the shape of a new reservation, the per-customer cap comparison, and the
 * rule that only a FULL refund returns the usage (that last one used to live in the
 * outbox handler registration, i.e. in infrastructure wiring).
 *
 * Explicitly NOT owned — and this is the whole point of the module (spec §3, "CAS ở
 * lại repository"): every transition is a conditional UPDATE in the repository
 * (`WHERE status='reserved'`, `WHERE status IN ('reserved','applied') RETURNING`,
 * `redeemed_count < usage_limit_total`, `redeemed_count > 0`). Those SQL guards are
 * the real state machine — they serialize concurrent claimers and make at-least-once
 * outbox redelivery a no-op. This entity states the rules; it never re-implements
 * them in memory, because a load-check-save version would reintroduce a lost update.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** Validated insert payload for a brand-new reservation (id/timestamps by the DB). */
export interface NewPromoRedemption {
  promotionId: string;
  bookingId: string;
  customerId: string;
  discountAmount: bigint;
}

export class PromoRedemption {
  private constructor() {}

  /** A reservation always enters at `reserved`; the repository row defaults that status. */
  static open(input: {
    promotionId: string;
    bookingId: string;
    customerId: string;
    discountAmount: bigint;
  }): NewPromoRedemption {
    return {
      promotionId: input.promotionId,
      bookingId: input.bookingId,
      customerId: input.customerId,
      discountAmount: input.discountAmount,
    };
  }
}

/**
 * §12.3 per-customer cap. The comparison is the rule; the serialisation is not —
 * the caller must hold the (promotion, customer) advisory lock for the answer to be
 * trustworthy, and both must sit inside the reservation transaction.
 */
export function exceedsPerCustomerLimit(used: number, limit: number): boolean {
  return used >= limit;
}

/**
 * §12.5 — only a FULL refund returns the usage to the pool; a partial refund keeps
 * the redemption `applied` (the customer did consume the promotion). Used by the
 * `booking.cancelled` outbox handler, where this rule used to be inline.
 */
export function releasesUsageOnCancel(refundPercent: number | undefined): boolean {
  return refundPercent === 100;
}
