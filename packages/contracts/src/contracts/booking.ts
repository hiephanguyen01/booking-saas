import { z } from 'zod';
import { cancellationTierSchema, paginationQuerySchema, uuidSchema } from './common';
import { passwordSchema } from './auth';

/** Booking state machine (§8). Terminal-ish branches: completed/no_show/rejected/expired/refunded. */
export const bookingStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'rejected',
  'expired',
  'refunded',
]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

/** Customer-facing booking lookup form. The storefront normalises the code before lookup. */
export const bookingLookupInputSchema = z.object({
  code: z.string().trim().min(1, 'Vui lòng nhập mã đặt chỗ').max(32),
});
export type BookingLookupInput = z.infer<typeof bookingLookupInputSchema>;

/** Bookable modes: exclusive-calendar (hourly/daily) + multi-unit inventory (§9.4). */
export const bookableModeSchema = z.enum(['hourly', 'daily', 'inventory']);
export type BookableMode = z.infer<typeof bookableModeSchema>;

/** Guest checkout (§8.6): no account, just contact info. */
export const guestInfoSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(5).max(20),
});
export type GuestInfo = z.infer<typeof guestInfoSchema>;

export const createBookingInputSchema = z.object({
  listingId: uuidSchema,
  mode: bookableModeSchema,
  /** Required for listings whose type uses fixed package selection. */
  packageId: uuidSchema.optional(),
  /** UTC ISO instants for the requested slot. */
  from: z.string().datetime(),
  to: z.string().datetime(),
  /** Units to rent — `inventory` mode only; ignored (forced to 1) for hourly/daily. */
  quantity: z.number().int().positive().max(1000).default(1),
  /** Quote shown at submit time; the API rejects instead of silently repricing. */
  expectedSubtotal: z.string().regex(/^\d+$/).optional(),
  guestCount: z.number().int().positive().max(1000).default(1),
  customerNote: z.string().max(1000).optional(),
  /** Required when the caller is not a logged-in customer. */
  guest: guestInfoSchema.optional(),
  /** Optional promotion code entered at checkout (§12.3) — normalised uppercase server-side. */
  promoCode: z.string().min(1).max(50).optional(),
  /**
   * Affiliate referral code (§15.1) read by the storefront BFF from the
   * `aff_<tenantId>` last-click cookie. Attribution is resolved + validated
   * server-side (self-referral / self-dealing dropped silently) so an invalid or
   * abusive code never blocks the booking.
   */
  refCode: z.string().min(1).max(50).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

export const cancelBookingInputSchema = z.object({
  reason: z.string().max(500).optional(),
  /** Email OTP — required for guest (unauthenticated) cancellation. */
  otp: z.string().min(4).max(10).optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;

/**
 * Generic optional-reason body shared by the partner reject / no-show / cancel
 * endpoints (§8.2). Replaces the old `markNoShowInputSchema` (kept as an alias
 * for backward compatibility) — the shape is identical.
 */
export const reasonInputSchema = z.object({ reason: z.string().max(500).optional() });
export type ReasonInput = z.infer<typeof reasonInputSchema>;

/** @deprecated Use {@link reasonInputSchema}. Retained so existing importers keep compiling. */
export const markNoShowInputSchema = reasonInputSchema;
export type MarkNoShowInput = ReasonInput;

/**
 * Guest upgrade-to-account (§8.6): a passwordless guest-checkout user sets a
 * password to become a full account. Refused server-side if the email already
 * has a password account.
 */
export const upgradeGuestInputSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
});
export type UpgradeGuestInput = z.infer<typeof upgradeGuestInputSchema>;

/** Partner marks an inventory rental returned + inspected (§9.4). */
export const markReturnedInputSchema = z.object({
  /** Assessed damage in VND đồng deducted from the security deposit (default 0). */
  damageAmount: z.string().regex(/^\d+$/).default('0'),
  reason: z.string().max(500).optional(),
});
export type MarkReturnedInput = z.infer<typeof markReturnedInputSchema>;

/** Partner confirms a non-inventory service was delivered and the on-site balance collected. */
export const completeBookingInputSchema = z.object({
  onsiteCollectedAmount: z.string().regex(/^\d+$/, 'Must be a non-negative VND integer string'),
  note: z.string().max(500).optional(),
});
export type CompleteBookingInput = z.infer<typeof completeBookingInputSchema>;

/** Partner annotates one of their own bookings (§8.2) — `partner_note`. */
export const partnerNoteInputSchema = z.object({
  /** Blank/omitted clears the note. */
  note: z.string().max(1000).optional(),
});
export type PartnerNoteInput = z.infer<typeof partnerNoteInputSchema>;

// ── Query contracts ──────────────────────────────────────────────────────────

/**
 * Filters for the tenant booking overview (`GET /tenant/bookings`, Task 1.13).
 * Offset-paginated: `status`/`partnerId` are honoured SERVER-side alongside
 * `page`/`pageSize` — never filter client-side over one page, or every derived
 * count is wrong past the page boundary.
 */
export const tenantBookingsQuerySchema = paginationQuerySchema.extend({
  status: bookingStatusSchema.optional(),
  partnerId: uuidSchema.optional(),
});
export type TenantBookingsQuery = z.infer<typeof tenantBookingsQuerySchema>;

// ── Responses ────────────────────────────────────────────────────────────────

/**
 * Customer identity as the TENANT (and the customer themselves) sees it — full
 * contact details. NEVER send this shape to a partner: use
 * {@link partnerBookingCustomerSchema} (§7.3 anti-disintermediation).
 */
export const bookingCustomerSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string(),
});
export type BookingCustomer = z.infer<typeof bookingCustomerSchema>;

/**
 * Customer identity as a PARTNER sees it (§7.3 anti-disintermediation). Two
 * deliberate differences from {@link bookingCustomerSchema}:
 *  - **No `email`** — ever. Partners must not harvest customer contacts.
 *  - `phone` is **masked** server-side (e.g. `0912•••678`) until the booking is
 *    `confirmed`, at which point the partner needs to reach the guest.
 *
 * The `phoneMasked` flag is load-bearing beyond the UI: it makes this type
 * structurally incompatible with {@link bookingResponseSchema}'s customer, so a
 * partner controller that mistakenly maps with the tenant mapper is a COMPILE
 * ERROR rather than a silent PII leak (nothing validates responses at runtime).
 */
export const partnerBookingCustomerSchema = z.object({
  fullName: z.string(),
  /** Masked until `confirmed`; null when the customer has no phone on file. */
  phone: z.string().nullable(),
  /** True while `phone` is masked — the single source of truth for the UI hint. */
  phoneMasked: z.boolean(),
});
export type PartnerBookingCustomer = z.infer<typeof partnerBookingCustomerSchema>;

/**
 * One overtime/surcharge line added before `completed` (§8.3). Commissioned like
 * an on-arrival amount. Written today only by the inventory late-fee path
 * (`{ type: 'late_fee', amount: '50000' }`); `amount` is a VND đồng digit string.
 */
export const additionalChargeSchema = z.object({
  type: z.string(),
  amount: z.string(),
});
export type AdditionalCharge = z.infer<typeof additionalChargeSchema>;

// `cancellationTierSchema` / `CancellationTier` now live in ./common (shared with the
// listing-policy contract); still re-exported package-wide via the barrel.

/**
 * An immutable jsonb snapshot frozen onto the booking at checkout. Deliberately
 * opaque: these are historical records whose writer shape may have evolved, and
 * no runtime validation strips them — a strict schema here would over-promise on
 * rows written by an older release. Known writer shapes are documented per field.
 */
const snapshotSchema = z.record(z.unknown()).nullable();

/** Fields common to every booking audience. Contains NO customer PII and NO internal financials. */
const bookingCoreSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: bookingStatusSchema,
  listingId: z.string(),
  listingTitle: z.string(),
  listingSlug: z.string(),
  /** Customer-facing context for the booked product, resolved with the booking. */
  listingDescription: z.string().nullable(),
  listingImageUrl: z.string().nullable(),
  listingAttributes: z.record(z.unknown()),
  resourceId: z.string(),
  resourceName: z.string(),
  partnerId: z.string(),
  partnerName: z.string(),
  bookingMode: z.string(),
  startUtc: z.string(),
  endUtc: z.string(),
  guestCount: z.number(),
  quantity: z.number(),
  /** VND đồng digit strings. */
  totalAmount: z.string(),
  discountAmount: z.string(),
  finalAmount: z.string(),
  depositAmount: z.string(),
  paidAmount: z.string(),
  /** Exact cancellation decision persisted for refund recovery; null before cancellation. */
  refundDueAmount: z.string().nullable(),
  refundPercent: z.number().int().min(0).max(100).nullable(),
  /** Inventory (§9.4): refundable deposit + fulfillment state. */
  securityDeposit: z.string(),
  pickedUpAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  damageAmount: z.string(),
  /** Overtime/surcharges accrued after checkout (§8.3); `[]` when none. */
  additionalCharges: z.array(additionalChargeSchema),
  /** Code entered at checkout (§12.3) — null when no promotion applied. */
  promoCode: z.string().nullable(),
  /** Frozen promotion terms: `{promotionId, code, discountType, discountValue, fundedBy, discountAmount}`. */
  promotionSnapshot: snapshotSchema,
  /** Refund tiers frozen at checkout (§11.3); `[]` when the listing had no policy. */
  cancellationPolicySnapshot: z.array(cancellationTierSchema).nullable(),
  customerNote: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Booking as the CUSTOMER sees it — the storefront contract (`/public/bookings*`).
 * This is the narrowest audience and the base every other one extends.
 *
 * It deliberately carries NO `partnerNote` (the partner's private note about the
 * guest), NO `commissionSnapshot` (the tenant's take-rate), and NO affiliate
 * attribution: the storefront BFF serialises whatever it receives down to the
 * customer's browser, so anything here is effectively public to that customer.
 * `pricingSnapshot` IS included — it is the customer's own price breakdown.
 */
export const bookingResponseSchema = bookingCoreSchema.extend({
  customer: bookingCustomerSchema,
  /** The customer's own frozen price breakdown (`{currency, mode, subtotal, depositAmount, securityDeposit, lineItems}`). */
  pricingSnapshot: snapshotSchema,
});
export type BookingResponse = z.infer<typeof bookingResponseSchema>;

/**
 * Booking as the TENANT console sees it — everything the customer sees, plus the
 * internal detail the tenant owns: the partner's note, the affiliate attribution
 * and the frozen commission split. Tenant-only; never returned to a storefront
 * customer or a partner.
 */
export const tenantBookingResponseSchema = bookingResponseSchema.extend({
  /** Partner's private operational note (§8.2) — set via `PATCH /partner/bookings/:id/note`. */
  partnerNote: z.string().nullable(),
  /** Affiliate attribution resolved at checkout (§15.1) — null when no referral. */
  affiliateId: z.string().nullable(),
  referralCode: z.string().nullable(),
  /**
   * Frozen commission split (§13.1):
   * `{ruleId, appliesTo, tenantRateType, tenantRate, platformRate, affiliateRateType, affiliateRate, isHouse}`.
   */
  commissionSnapshot: snapshotSchema,
});
export type TenantBookingResponse = z.infer<typeof tenantBookingResponseSchema>;

/**
 * Booking as a PARTNER sees it (§7.3). The core, plus their OWN note, minus
 * everything a partner has no business reading: the customer's email, the
 * customer's unmasked phone before confirmation, the affiliate attribution, and
 * the commission / pricing snapshots (no partner surface exposes commission today).
 */
export const partnerBookingResponseSchema = bookingCoreSchema.extend({
  customer: partnerBookingCustomerSchema,
  /** The partner's own private note (§8.2) — theirs to read and write. */
  partnerNote: z.string().nullable(),
});
export type PartnerBookingResponse = z.infer<typeof partnerBookingResponseSchema>;

/** Returned when cancelling — includes the computed (not yet executed) refund. */
export const cancelBookingResponseSchema = bookingResponseSchema.extend({
  refundAmount: z.string(),
  refundPercent: z.number(),
});
export type CancelBookingResponse = z.infer<typeof cancelBookingResponseSchema>;

/** Partner-audience cancel result (`POST /partner/bookings/:id/cancel`). */
export const partnerCancelBookingResponseSchema = partnerBookingResponseSchema.extend({
  refundAmount: z.string(),
  refundPercent: z.number(),
});
export type PartnerCancelBookingResponse = z.infer<typeof partnerCancelBookingResponseSchema>;

/**
 * Returned when an inventory rental is returned — the deposit settlement (§9.4).
 * Partner-audience: `POST /partner/bookings/:id/return` is a partner-only route.
 */
export const returnBookingResponseSchema = partnerBookingResponseSchema.extend({
  lateFee: z.string(),
  depositRefund: z.string(),
  depositShortfall: z.string(),
});
export type ReturnBookingResponse = z.infer<typeof returnBookingResponseSchema>;

/** One transition in a booking's audit trail (§8.2) — `booking_status_history`. */
export const bookingStatusHistoryResponseSchema = z.object({
  id: z.string(),
  /** Null for the very first row (creation into `draft`). */
  fromStatus: bookingStatusSchema.nullable(),
  toStatus: bookingStatusSchema,
  /** Null for system/automated transitions (expiry, auto-complete). */
  actorId: z.string().nullable(),
  /** Resolved display name; null when the actor is the system or was deleted. */
  actorName: z.string().nullable(),
  /** Free text supplied by whoever made the transition (e.g. a cancellation reason). */
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type BookingStatusHistoryResponse = z.infer<typeof bookingStatusHistoryResponseSchema>;

/** OTP issuance — `devOtp` is only populated outside production for testing. */
export const bookingOtpResponseSchema = z.object({
  code: z.string(),
  expiresInSec: z.number(),
  devOtp: z.string().optional(),
});
export type BookingOtpResponse = z.infer<typeof bookingOtpResponseSchema>;

/**
 * Wire shape of the partner master-calendar feed (`GET /partner/bookings`, Task
 * 1.14). Amounts are VND đồng digit strings; instants are UTC ISO strings.
 * Partner audience — `customer` is masked per §7.3, exactly as on
 * {@link partnerBookingResponseSchema}.
 */
export const partnerCalendarBookingResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: bookingStatusSchema,
  listingId: z.string(),
  listingTitle: z.string(),
  listingTypeId: z.string(),
  listingTypeName: z.string(),
  resourceId: z.string(),
  bookingMode: z.string(),
  startUtc: z.string(),
  endUtc: z.string(),
  guestCount: z.number(),
  quantity: z.number(),
  /** Who is showing up — masked contact until the booking is `confirmed` (§7.3). */
  customer: partnerBookingCustomerSchema,
  finalAmount: z.string(),
  discountAmount: z.string(),
  depositAmount: z.string(),
  paidAmount: z.string(),
  additionalCharges: z.array(additionalChargeSchema),
  /** Inventory (§9.4) fulfillment state — drives the partner pick-up/return actions. */
  securityDeposit: z.string(),
  pickedUpAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  customerNote: z.string().nullable(),
  /** Payment/approval deadline while pending — drives the "expires in" countdown. */
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PartnerCalendarBookingResponse = z.infer<typeof partnerCalendarBookingResponseSchema>;

/**
 * Per-partner booking health for the tenant dashboard (§7.3): raw counts plus
 * derived cancellation / no-show rates (0–1 fractions, 0 when the partner has no
 * bookings yet). The rates are computed in the booking mapper, not the controller.
 */
export const partnerBookingStatsResponseSchema = z.object({
  partnerId: z.string(),
  total: z.number(),
  cancelled: z.number(),
  noShow: z.number(),
  completed: z.number(),
  confirmed: z.number(),
  cancellationRate: z.number(),
  noShowRate: z.number(),
});
export type PartnerBookingStatsResponse = z.infer<typeof partnerBookingStatsResponseSchema>;
