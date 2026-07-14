import { z } from 'zod';
import { uuidSchema } from './common';

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

// ── Self-signup (storefront) ────────────────────────────────────────────────

/** Storefront "become an affiliate" — a logged-in user applies to a tenant (§15.1). */
export const applyAffiliateInputSchema = z.object({
  tenantId: uuidSchema,
  /** Free-form payout details (bank name, account no, holder). Stored as jsonb. */
  payoutInfo: z
    .object({
      bankName: z.string().max(200).optional(),
      accountNo: z.string().max(50).optional(),
      accountHolder: z.string().max(200).optional(),
      note: z.string().max(500).optional(),
    })
    .default({}),
});
export type ApplyAffiliateInput = z.infer<typeof applyAffiliateInputSchema>;

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
  clicksCount: z.number(),
  createdAt: z.string(),
});
export type ReferralLinkResponse = z.infer<typeof referralLinkResponseSchema>;

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
  status: affiliateStatusSchema,
  /** Custom affiliate rate (whole percent digit string) that overrides the rule rate; null = use the rule. */
  customRate: z.string().nullable(),
  createdAt: z.string(),
});
export type AffiliateResponse = z.infer<typeof affiliateResponseSchema>;

/** Affiliate dashboard summary (§15.3). Amounts are signed VND đồng digit strings. */
export const affiliateStatsResponseSchema = z.object({
  clicks: z.number(),
  bookings: z.number(),
  /** bookings / clicks, 0–1, rounded to 4 dp. */
  conversionRate: z.number(),
  pendingCommission: z.string(),
  confirmedCommission: z.string(),
  paidCommission: z.string(),
});
export type AffiliateStatsResponse = z.infer<typeof affiliateStatsResponseSchema>;

export const affiliateCommissionResponseSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingCode: z.string().nullable(),
  amount: z.string(),
  status: affiliateCommissionStatusSchema,
  createdAt: z.string(),
});
export type AffiliateCommissionResponse = z.infer<typeof affiliateCommissionResponseSchema>;

// ── Tenant-side management ─────────────────────────────────────────────────────

/** A row on the tenant's affiliate-management table (§15.3). */
export const affiliateListItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  status: affiliateStatusSchema,
  customRate: z.string().nullable(),
  linksCount: z.number(),
  /** Total confirmed + paid commission earned, VND đồng digit string. */
  totalEarned: z.string(),
  createdAt: z.string(),
});
export type AffiliateListItem = z.infer<typeof affiliateListItemSchema>;

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

/** Detail view for a single affiliate (tenant side): profile + links + commissions. */
export const affiliateDetailResponseSchema = z.object({
  affiliate: affiliateListItemSchema,
  links: z.array(referralLinkResponseSchema),
  commissions: z.array(affiliateCommissionResponseSchema),
});
export type AffiliateDetailResponse = z.infer<typeof affiliateDetailResponseSchema>;

export { vndDigits as affiliateVndDigits, signedVndDigits as affiliateSignedVndDigits };
