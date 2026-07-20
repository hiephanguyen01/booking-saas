import type {
  AdditionalCharge,
  BookingCustomer,
  BookingResponse,
  BookingStatusHistoryResponse,
  CancellationTier,
  CancelBookingResponse,
  PartnerBookingCustomer,
  PartnerBookingResponse,
  PartnerBookingStatsResponse,
  PartnerCancelBookingResponse,
  ReturnBookingResponse,
  TenantBookingResponse,
} from '@booking/contracts';
import type {
  BookingCustomerRecord,
  BookingRecord,
  BookingStatusHistoryRecord,
  PartnerBookingStat,
} from '../domain/ports/booking-repository.port';
import { maskPhone } from '../domain/mask-phone';
import type { CancelResult } from './use-cases/cancel-booking.use-case';
import type { ReturnResult } from './use-cases/mark-returned.use-case';

/**
 * Booking → wire, split by AUDIENCE. There are three entry points and the caller
 * must pick one explicitly — the audience is never inferred from context:
 *
 *   - {@link toCustomerBookingResponse} storefront — the customer's own data. No
 *     `partnerNote` (the partner's private note about them), no `commissionSnapshot`
 *     (the tenant's take-rate), no affiliate attribution. The storefront BFF
 *     serialises this straight to the customer's browser.
 *   - {@link toBookingResponse}         tenant console — the superset.
 *   - {@link toPartnerBookingResponse}  partner (§7.3) — no email, phone masked
 *     until confirmed, no commission/pricing/affiliate detail.
 *
 * Confusing the PARTNER shape with the others is a COMPILE error, not a silent
 * leak: nothing validates or strips responses at runtime, so
 * `PartnerBookingResponse` deliberately carries `customer.phoneMasked`, which the
 * other customer shapes lack — making them structurally unassignable to a
 * partner-typed handler.
 */

// ── Customer identity ────────────────────────────────────────────────────────

function toCustomer(c: BookingCustomerRecord): BookingCustomer {
  return { id: c.id, fullName: c.fullName, phone: c.phone, email: c.email };
}

/**
 * Statuses at which the partner has a genuine, standing relationship with the
 * guest and legitimately needs to reach them: a live confirmed booking, plus the
 * terminal fulfilment states (`completed`, `no_show`) where the partner may still
 * need to follow up (a lost item, a dispute). Every other status — pending,
 * cancelled, rejected, expired, refunded — keeps the phone masked (§7.3).
 */
const PHONE_REVEALED_STATUSES = new Set(['confirmed', 'completed', 'no_show']);

/**
 * The partner's view of the customer (§7.3): never the email, and never the real
 * phone until the booking reaches a status where the partner legitimately needs to
 * reach the guest (see `PHONE_REVEALED_STATUSES`). Masking happens HERE,
 * server-side, so the real number is never serialised into a partner payload.
 */
export function toPartnerCustomer(
  c: BookingCustomerRecord,
  status: string,
): PartnerBookingCustomer {
  const revealed = PHONE_REVEALED_STATUSES.has(status);
  return {
    fullName: c.fullName,
    phone: revealed ? c.phone : maskPhone(c.phone),
    phoneMasked: !revealed && c.phone !== null,
  };
}

// ── Shared, audience-agnostic fields ─────────────────────────────────────────

/** Coerce the `additional_charges` jsonb array to the wire shape, dropping malformed rows. */
export function toAdditionalCharges(raw: unknown): AdditionalCharge[] {
  if (!Array.isArray(raw)) return [];
  const charges: AdditionalCharge[] = [];
  for (const item of raw) {
    const { type, amount } = (item ?? {}) as { type?: unknown; amount?: unknown };
    if (typeof type !== 'string') continue;
    // Money crosses the wire as a digit string — never a float (rule 4).
    if (typeof amount === 'string' && /^-?\d+$/.test(amount)) charges.push({ type, amount });
    else if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
      charges.push({ type, amount: BigInt(amount).toString() });
    }
  }
  return charges;
}

/** Coerce the snapshotted refund tiers (§11.3) to the wire shape; null when absent. */
function toCancellationTiers(raw: unknown): CancellationTier[] | null {
  if (!Array.isArray(raw)) return null;
  const tiers: CancellationTier[] = [];
  for (const item of raw) {
    const { hoursBefore, refundPercent } = (item ?? {}) as {
      hoursBefore?: unknown;
      refundPercent?: unknown;
    };
    if (typeof hoursBefore === 'number' && typeof refundPercent === 'number') {
      tiers.push({ hoursBefore, refundPercent });
    }
  }
  return tiers;
}

/** An opaque jsonb snapshot → a plain object, or null for anything non-object. */
function toSnapshot(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Fields every audience may see — no customer PII, no internal financials. */
function toCore(b: BookingRecord) {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    listingId: b.listingId,
    listingTitle: b.listingTitle,
    listingSlug: b.listingSlug,
    listingDescription: b.listingDescription,
    listingImageUrl: b.listingImageUrl,
    listingAttributes:
      b.listingAttributes !== null &&
      typeof b.listingAttributes === 'object' &&
      !Array.isArray(b.listingAttributes)
        ? (b.listingAttributes as Record<string, unknown>)
        : {},
    resourceId: b.resourceId,
    resourceName: b.resourceName,
    partnerId: b.partnerId,
    partnerName: b.partnerName,
    bookingMode: b.bookingMode,
    startUtc: b.startUtc.toISOString(),
    endUtc: b.endUtc.toISOString(),
    guestCount: b.guestCount,
    quantity: b.quantity,
    totalAmount: b.totalAmount.toString(),
    discountAmount: b.discountAmount.toString(),
    finalAmount: b.finalAmount.toString(),
    depositAmount: b.depositAmount.toString(),
    paidAmount: b.paidAmount.toString(),
    refundDueAmount: b.refundDueAmount?.toString() ?? null,
    refundPercent: b.refundPercent,
    securityDeposit: b.securityDeposit.toString(),
    pickedUpAt: b.pickedUpAt?.toISOString() ?? null,
    returnedAt: b.returnedAt?.toISOString() ?? null,
    damageAmount: b.damageAmount.toString(),
    additionalCharges: toAdditionalCharges(b.additionalCharges),
    promoCode: b.promoCode,
    promotionSnapshot: toSnapshot(b.promotionSnapshot),
    cancellationPolicySnapshot: toCancellationTiers(b.cancellationPolicySnapshot),
    customerNote: b.customerNote,
    expiresAt: b.expiresAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

// ── Audience entry points ────────────────────────────────────────────────────

/**
 * CUSTOMER audience (`/public/bookings*`) — the customer's own booking. Withholds
 * the partner's private note, the tenant's commission snapshot and the affiliate
 * attribution: the storefront ships this payload to the customer's browser.
 */
export function toCustomerBookingResponse(b: BookingRecord): BookingResponse {
  return {
    ...toCore(b),
    customer: toCustomer(b.customer),
    pricingSnapshot: toSnapshot(b.pricingSnapshot),
  };
}

/**
 * TENANT audience — everything the customer sees plus the tenant's own internal
 * detail. **Never call this from a partner- or public-scoped controller.**
 */
export function toBookingResponse(b: BookingRecord): TenantBookingResponse {
  return {
    ...toCustomerBookingResponse(b),
    partnerNote: b.partnerNote,
    affiliateId: b.affiliateId,
    referralCode: b.referralCode,
    commissionSnapshot: toSnapshot(b.commissionSnapshot),
  };
}

/**
 * PARTNER audience (§7.3) — masked customer, no email, their own note, and none
 * of the commission / pricing / affiliate detail (no partner surface exposes the
 * tenant's take-rate today).
 */
export function toPartnerBookingResponse(b: BookingRecord): PartnerBookingResponse {
  return {
    ...toCore(b),
    customer: toPartnerCustomer(b.customer, b.status),
    partnerNote: b.partnerNote,
  };
}

/**
 * Cancel result for the CUSTOMER and TENANT cancel routes. Built on the
 * customer-safe base on purpose — `/public/bookings/:code/cancel` returns this
 * straight to the storefront, and a refund figure needs none of the internal detail.
 */
export function toCancelResponse(r: CancelResult): CancelBookingResponse {
  return {
    ...toCustomerBookingResponse(r.booking),
    refundAmount: r.refundAmount.toString(),
    refundPercent: r.refundPercent,
  };
}

/** Partner-audience cancel result — same refund figures, masked customer. */
export function toPartnerCancelResponse(r: CancelResult): PartnerCancelBookingResponse {
  return {
    ...toPartnerBookingResponse(r.booking),
    refundAmount: r.refundAmount.toString(),
    refundPercent: r.refundPercent,
  };
}

/** Inventory return settlement (§9.4) — a partner-only route, so partner audience. */
export function toReturnResponse(r: ReturnResult): ReturnBookingResponse {
  return {
    ...toPartnerBookingResponse(r.booking),
    lateFee: r.lateFee.toString(),
    depositRefund: r.depositRefund.toString(),
    depositShortfall: r.depositShortfall.toString(),
  };
}

/** Transition audit trail (§8.2). Audience-agnostic: no contact details, by construction. */
export function toStatusHistoryResponse(
  h: BookingStatusHistoryRecord,
): BookingStatusHistoryResponse {
  return {
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorId: h.actorId,
    actorName: h.actorName,
    reason: h.reason,
    createdAt: h.createdAt.toISOString(),
  };
}

/**
 * Enrich raw per-partner counts with derived cancellation / no-show rates
 * (0–1 fractions; 0 when the partner has no bookings). Keeps the ratio math out
 * of the controller — mirrors the derived `conversionRate` in the affiliate mapper.
 */
export function toPartnerBookingStatsResponse(s: PartnerBookingStat): PartnerBookingStatsResponse {
  return {
    partnerId: s.partnerId,
    total: s.total,
    cancelled: s.cancelled,
    noShow: s.noShow,
    completed: s.completed,
    confirmed: s.confirmed,
    cancellationRate: s.total > 0 ? s.cancelled / s.total : 0,
    noShowRate: s.total > 0 ? s.noShow / s.total : 0,
  };
}
