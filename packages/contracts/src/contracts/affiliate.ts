import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';
import { bookingStatusSchema } from './booking';
import { rateTypeSchema } from './finance';

/**
 * Affiliate system contracts (TONG-QUAN.md §15, §7.8). Affiliates refer customers
 * to a tenant's storefront via referral links (`?ref=CODE`), are attributed to a
 * booking via a last-click cookie, and earn commission through the double-entry
 * ledger. Money always crosses the wire as a non-negative VND đồng digit string;
 * percents are whole numbers (5 = 5%).
 */
const vndDigits = z.string().regex(/^\d+$/, 'Must be a non-negative VND integer string');
const signedVndDigits = z.string().regex(/^-?\d+$/, 'Must be a VND integer string');

export const affiliateStatusSchema = z.enum(['pending', 'approved', 'suspended']);
export type AffiliateStatusDto = z.infer<typeof affiliateStatusSchema>;

/** §7.8 commission lifecycle: pending → confirmed → paid, or reversed / clawed_back. */
export const affiliateCommissionStatusSchema = z.enum([
  'pending',
  'confirmed',
  'paid',
  'reversed',
  'clawed_back',
]);
export type AffiliateCommissionStatusDto = z.infer<typeof affiliateCommissionStatusSchema>;

export const referralTargetSchema = z.enum(['tenant_home', 'listing']);
export type ReferralTargetDto = z.infer<typeof referralTargetSchema>;

/**
 * Where the affiliate's commission rate came from (§15.2 priority:
 * `custom_rate` > applicable rule > nothing configured).
 */
export const affiliateRateSourceSchema = z.enum(['custom', 'rule', 'none']);
export type AffiliateRateSourceDto = z.infer<typeof affiliateRateSourceSchema>;

/**
 * The rate an affiliate is actually paid at, resolved server-side. `customRate`
 * alone is not enough to render: it is an OVERRIDE and is null in the common case,
 * where the number that matters lives on the tenant's commission rule. These
 * fields are always populated, so a UI never has to say "by the rule" and then
 * fail to name the rule's number.
 */
const effectiveRateFields = {
  /** `percent`: whole percent digit string (5 = 5%). `fixed`: VND đồng digit string. */
  effectiveRate: z.string().regex(/^\d+$/, 'Must be a non-negative integer string'),
  effectiveRateType: rateTypeSchema,
  effectiveRateSource: affiliateRateSourceSchema,
} as const;

/** Free-form payout details (bank name, account no, holder). Stored as jsonb. */
export const affiliatePayoutInfoSchema = z.object({
  bankName: z.string().max(200).optional(),
  accountNo: z.string().max(50).optional(),
  accountHolder: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});
export type AffiliatePayoutInfo = z.infer<typeof affiliatePayoutInfoSchema>;

// ── Self-signup (storefront) ────────────────────────────────────────────────

/** Storefront "become an affiliate" — a logged-in user applies to a tenant (§15.1). */
export const applyAffiliateInputSchema = z.object({
  tenantId: uuidSchema,
  payoutInfo: affiliatePayoutInfoSchema.default({}),
});
export type ApplyAffiliateInput = z.infer<typeof applyAffiliateInputSchema>;

/**
 * `PATCH /affiliate/payout-info` — the affiliate corrects its own bank details.
 * A full replace of the payout object (mirrors the partner's
 * `updatePayoutInfoInputSchema`): omitting a field clears it. Without this the
 * details captured at signup are write-once and a typo'd account number is
 * uncorrectable.
 */
export const updateAffiliatePayoutInfoInputSchema = affiliatePayoutInfoSchema;
export type UpdateAffiliatePayoutInfoInput = z.infer<typeof updateAffiliatePayoutInfoInputSchema>;

/**
 * Storefront become-an-affiliate form (§15.1): account fields + optional payout
 * details, mirroring `partnerRegistrationSchema`. Kept flat (no `.default()`) so
 * it drives GenericForm directly; the route splits it into register + apply calls.
 */
export const affiliateRegistrationSchema = z.object({
  // Account — mirrors registerInputSchema.
  fullName: z.string().min(1, 'Vui lòng nhập họ và tên').max(200),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  phone: z.string().max(20).optional(),
  // Payout details (optional — can be completed later in the dashboard).
  bankName: z.string().max(200).optional(),
  accountNo: z.string().max(50).optional(),
  accountHolder: z.string().max(200).optional(),
});
export type AffiliateRegistrationInput = z.infer<typeof affiliateRegistrationSchema>;

// ── Referral links ──────────────────────────────────────────────────────────

export const createReferralLinkInputSchema = z
  .object({
    target: referralTargetSchema.default('tenant_home'),
    /** Required when `target === 'listing'`. */
    listingId: uuidSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.target === 'listing' && !data.listingId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['listingId'],
        message: 'listingId is required for a listing-targeted link',
      });
    }
  });
export type CreateReferralLinkInput = z.infer<typeof createReferralLinkInputSchema>;

export const referralLinkResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  target: referralTargetSchema,
  listingId: z.string().nullable(),
  /** Title of the targeted listing; null for a `tenant_home` link (or a deleted listing). */
  listingTitle: z.string().nullable(),
  clicksCount: z.number(),
  createdAt: z.string(),
});
export type ReferralLinkResponse = z.infer<typeof referralLinkResponseSchema>;

/** `GET /affiliate/links` — paginated; case-insensitive search over the referral code + link label. */
export const listAffiliateLinksQuerySchema = paginationQuerySchema.extend({
  /** Case-insensitive search over the referral code + the link's label (targeted listing title). */
  q: z.string().trim().max(200).optional(),
});
export type ListAffiliateLinksQuery = z.infer<typeof listAffiliateLinksQuerySchema>;

// ── Referral click tracking (storefront BFF) ──────────────────────────────────

/** Public tracking hit (§15.1) — tenant resolved from Host; visitorId de-dups clicks. */
export const trackReferralInputSchema = z.object({
  code: z.string().min(1).max(50),
  /** Stable per-browser id (a cookie) so repeat views by one visitor don't double-count. */
  visitorId: z.string().min(1).max(100).optional(),
});
export type TrackReferralInput = z.infer<typeof trackReferralInputSchema>;

export const trackReferralResponseSchema = z.object({
  /** True when the code matched an approved affiliate — the caller should set the attribution cookie. */
  valid: z.boolean(),
});
export type TrackReferralResponse = z.infer<typeof trackReferralResponseSchema>;

// ── Affiliate self-service ("me") ─────────────────────────────────────────────

/** A single affiliate membership (one per tenant) surfaced to the portal. */
export const affiliateResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  tenantName: z.string(),
  /**
   * The tenant storefront's primary hostname (§6.1) — the origin every referral
   * link for this membership must point at. A referral URL is per-tenant data, so
   * it can never be built from a single platform-wide env var. Null only when the
   * tenant has no primary domain mapped; the caller then falls back to its own
   * configured storefront origin.
   */
  tenantHostname: z.string().nullable(),
  status: affiliateStatusSchema,
  /** Custom affiliate rate (whole percent digit string) that overrides the rule rate; null = use the rule. */
  customRate: z.string().nullable(),
  ...effectiveRateFields,
  payoutInfo: affiliatePayoutInfoSchema,
  createdAt: z.string(),
});
export type AffiliateResponse = z.infer<typeof affiliateResponseSchema>;

/** Affiliate dashboard summary (§15.3). Amounts are VND đồng digit strings. */
export const affiliateStatsResponseSchema = z.object({
  clicks: z.number(),
  bookings: z.number(),
  /** bookings / clicks, 0–1, rounded to 4 dp. */
  conversionRate: z.number(),
  pendingCommission: z.string(),
  confirmedCommission: z.string(),
  paidCommission: z.string(),
  /** Commission voided before completion (booking cancelled/rejected/expired) — never payable. */
  reversedCommission: z.string(),
  /** Commission taken back after a post-completion dispute/refund (§7.8). */
  clawedBackCommission: z.string(),
});
export type AffiliateStatsResponse = z.infer<typeof affiliateStatsResponseSchema>;

export const affiliateCommissionResponseSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingCode: z.string().nullable(),
  /** The source booking's lifecycle state — explains WHY a commission is pending/reversed. */
  bookingStatus: bookingStatusSchema.nullable(),
  /** What the customer paid for the booking (`final_amount`), VND đồng digit string. */
  bookingTotal: z.string().nullable(),
  /** Title of the booked listing — a commission row is unreadable without it. */
  listingTitle: z.string().nullable(),
  amount: z.string(),
  status: affiliateCommissionStatusSchema,
  /** When the commission settled; null until `status === 'paid'`. */
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AffiliateCommissionResponse = z.infer<typeof affiliateCommissionResponseSchema>;

/** `GET /affiliate/commissions` — paginated; code search + status + created-at range. */
export const listAffiliateCommissionsQuerySchema = paginationQuerySchema.extend({
  /** Case-insensitive search over the booking's referral code + booking code. */
  q: z.string().trim().max(200).optional(),
  status: affiliateCommissionStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ListAffiliateCommissionsQuery = z.infer<typeof listAffiliateCommissionsQuerySchema>;

// ── Tenant-side management ─────────────────────────────────────────────────────

/** A row on the tenant's affiliate-management table (§15.3). */
export const affiliateListItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  status: affiliateStatusSchema,
  customRate: z.string().nullable(),
  ...effectiveRateFields,
  linksCount: z.number(),
  /** Total clicks across the affiliate's links — the funnel the tenant is paying for. */
  clicks: z.number(),
  /** Bookings with a live (non-reversed) commission. */
  bookings: z.number(),
  /** bookings / clicks, 0–1, rounded to 4 dp. */
  conversionRate: z.number(),
  // The tenant's affiliate page exists to decide what to pay, so the split must
  // survive the wire: `pending` is not yet owed, `confirmed` IS owed now, `paid`
  // is already settled. Collapsing them into one number conflates the three.
  /** Commission on confirmed-but-not-completed bookings — not payable yet. */
  pendingCommission: z.string(),
  /** Commission owed right now (booking completed, payout not settled). */
  confirmedCommission: z.string(),
  /** Commission already settled through a payout. */
  paidCommission: z.string(),
  /**
   * confirmed + paid, VND đồng digit string.
   * @deprecated Conflates money owed with money already paid — read
   * `confirmedCommission` / `paidCommission` instead. Kept until the tenant
   * affiliate pages move to the split.
   */
  totalEarned: z.string(),
  createdAt: z.string(),
});
export type AffiliateListItem = z.infer<typeof affiliateListItemSchema>;

/**
 * `GET /tenant/affiliates` list query (§15.3): offset pagination plus an optional
 * membership-`status` filter. The response is a `PaginatedWithCounts` — the
 * per-status `counts` are computed over every membership (ignoring this filter) so
 * the filter-tab chips always show their own totals.
 */
export const listAffiliatesQuerySchema = paginationQuerySchema.extend({
  status: affiliateStatusSchema.optional(),
});
export type ListAffiliatesQuery = z.infer<typeof listAffiliatesQuerySchema>;

export const tenantAffiliateStatusInputSchema = z.object({
  status: z.enum(['approved', 'suspended']),
});
export type TenantAffiliateStatusInput = z.infer<typeof tenantAffiliateStatusInputSchema>;

export const tenantUpdateAffiliateInputSchema = z.object({
  /**
   * Custom affiliate rate as a whole percent (0–100) digit string, or null to
   * clear the override and fall back to the applicable commission rule. Guarded
   * server-side against `platform% + affiliate% ≤ tenant%` (§3.3).
   */
  customRate: vndDigits.nullable(),
});
export type TenantUpdateAffiliateInput = z.infer<typeof tenantUpdateAffiliateInputSchema>;

/**
 * The affiliate profile on the DETAIL view. Extends the lean list row with the
 * fields the tenant needs to actually PAY the affiliate — bank details + phone —
 * plus the two commission buckets (`reversed`, `clawedBack`) that let the earnings
 * numbers reconcile. Kept separate from `affiliateListItemSchema` so the LIST
 * endpoint stays a single lean query and never has to join the extra data.
 */
export const affiliateDetailProfileSchema = affiliateListItemSchema.extend({
  /** The affiliate's contact phone (from its user row); null when not provided. */
  phone: z.string().nullable(),
  /**
   * The affiliate's bank details — the tenant can't settle a payout without them,
   * so the detail page surfaces the same shape the affiliate manages on its own
   * self-view (`/affiliate/me`).
   */
  payoutInfo: affiliatePayoutInfoSchema,
  /** Commission voided before completion (booking cancelled/rejected/expired) — never payable. */
  reversedCommission: z.string(),
  /** Commission taken back after a post-completion dispute/refund (§7.8). */
  clawedBackCommission: z.string(),
});
export type AffiliateDetailProfile = z.infer<typeof affiliateDetailProfileSchema>;

/** Detail view for a single affiliate (tenant side): profile + links + commissions. */
export const affiliateDetailResponseSchema = z.object({
  affiliate: affiliateDetailProfileSchema,
  links: z.array(referralLinkResponseSchema),
  commissions: z.array(affiliateCommissionResponseSchema),
});
export type AffiliateDetailResponse = z.infer<typeof affiliateDetailResponseSchema>;

/** Minimal echo after approving/suspending an affiliate (§15.1). */
export const affiliateStatusResponseSchema = z.object({
  id: z.string(),
  status: affiliateStatusSchema,
});
export type AffiliateStatusResponse = z.infer<typeof affiliateStatusResponseSchema>;

/** Echo after setting/clearing a custom commission rate (§15.2). */
export const affiliateRateResponseSchema = z.object({
  id: z.string(),
  /** Whole-percent digit string, or null when the override is cleared. */
  customRate: z.string().nullable(),
  // Clearing the override falls back to the rule, so the caller cannot know the
  // resulting rate from `customRate: null` — the resolved rate comes back with it.
  ...effectiveRateFields,
});
export type AffiliateRateResponse = z.infer<typeof affiliateRateResponseSchema>;

export { vndDigits as affiliateVndDigits, signedVndDigits as affiliateSignedVndDigits };
