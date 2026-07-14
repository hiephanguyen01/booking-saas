import { z } from 'zod';
import { uuidSchema } from './common';

/**
 * Finance contracts (TONG-QUAN.md §3, §7.7, §13): commission rules, the
 * double-entry ledger, balances and payouts. Money always crosses the wire as a
 * non-negative VND đồng digit string; percents are whole numbers (15 = 15%).
 */
const vndDigits = z.string().regex(/^\d+$/, 'Must be a non-negative VND integer string');
const signedVndDigits = z.string().regex(/^-?\d+$/, 'Must be a VND integer string');

export const rateTypeSchema = z.enum(['percent', 'fixed']);
export type RateTypeDto = z.infer<typeof rateTypeSchema>;

export const commissionAppliesToSchema = z.enum([
  'tenant_default',
  'listing_type',
  'category',
  'partner',
]);
export type CommissionAppliesToDto = z.infer<typeof commissionAppliesToSchema>;

// ── Commission rules ────────────────────────────────────────────────────────

const commissionRuleBaseSchema = z.object({
  appliesTo: commissionAppliesToSchema,
  /** Required when `appliesTo === 'listing_type'`. */
  listingTypeId: uuidSchema.optional(),
  /** Required when `appliesTo === 'category'`. */
  categoryId: uuidSchema.optional(),
  /** Required when `appliesTo === 'partner'`. */
  partnerId: uuidSchema.optional(),
  tenantRateType: rateTypeSchema.default('percent'),
  /** `percent`: whole percent 0–100. `fixed`: VND đồng. Digit string either way. */
  tenantRate: vndDigits,
  affiliateRateType: rateTypeSchema.default('percent'),
  affiliateRate: vndDigits.default('0'),
  /** ISO datetimes bounding effectiveness (§7.7). */
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

function refineTarget(
  data: { appliesTo: CommissionAppliesToDto; listingTypeId?: string; categoryId?: string; partnerId?: string },
  ctx: z.RefinementCtx,
): void {
  const need = (field: 'listingTypeId' | 'categoryId' | 'partnerId') => {
    if (!data[field]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required for appliesTo=${data.appliesTo}` });
    }
  };
  if (data.appliesTo === 'listing_type') need('listingTypeId');
  if (data.appliesTo === 'category') need('categoryId');
  if (data.appliesTo === 'partner') need('partnerId');
}

function refinePercentRate(
  data: { tenantRateType?: RateTypeDto; tenantRate?: string; affiliateRateType?: RateTypeDto; affiliateRate?: string },
  ctx: z.RefinementCtx,
): void {
  if (data.tenantRateType === 'percent' && data.tenantRate !== undefined) {
    const n = Number(data.tenantRate);
    if (n < 0 || n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tenantRate'], message: 'A percent tenant rate must be between 0 and 100' });
    }
  }
  if (data.affiliateRateType === 'percent' && data.affiliateRate !== undefined) {
    const n = Number(data.affiliateRate);
    if (n < 0 || n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['affiliateRate'], message: 'A percent affiliate rate must be between 0 and 100' });
    }
  }
}

/**
 * `platformRate` is intentionally NOT settable here — it is platform-admin-only
 * (§7.7). The tenant-facing create/update use cases inherit the platform rate
 * from the tenant default or leave it unchanged.
 */
export const createCommissionRuleInputSchema = commissionRuleBaseSchema.superRefine((data, ctx) => {
  refineTarget(data, ctx);
  refinePercentRate(data, ctx);
});
export type CreateCommissionRuleInput = z.infer<typeof createCommissionRuleInputSchema>;

export const updateCommissionRuleInputSchema = commissionRuleBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.appliesTo !== undefined) {
      refineTarget(
        { appliesTo: data.appliesTo, listingTypeId: data.listingTypeId, categoryId: data.categoryId, partnerId: data.partnerId },
        ctx,
      );
    }
    refinePercentRate(data, ctx);
  });
export type UpdateCommissionRuleInput = z.infer<typeof updateCommissionRuleInputSchema>;

/** Platform-admin-only: set the platform fee % on a rule (§7.7). */
export const setPlatformRateInputSchema = z.object({
  platformRate: z.number().int().min(0).max(100),
});
export type SetPlatformRateInput = z.infer<typeof setPlatformRateInputSchema>;

export const commissionRuleResponseSchema = z.object({
  id: z.string(),
  appliesTo: commissionAppliesToSchema,
  listingTypeId: z.string().nullable(),
  categoryId: z.string().nullable(),
  partnerId: z.string().nullable(),
  tenantRateType: rateTypeSchema,
  /** VND đồng digit string; a whole percent for `percent` rules. */
  tenantRate: z.string(),
  /** Platform fee, whole percent. */
  platformRate: z.number(),
  affiliateRateType: rateTypeSchema,
  affiliateRate: z.string(),
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  createdAt: z.string(),
});
export type CommissionRuleResponse = z.infer<typeof commissionRuleResponseSchema>;

// ── Ledger + balances ───────────────────────────────────────────────────────

export const ledgerEntryTypeSchema = z.enum([
  'booking_revenue',
  'partner_share',
  'platform_fee',
  'affiliate_commission',
  'promo_discount',
  'cancellation_fee',
  'additional_charge',
  'security_deposit',
  'damage_deduction',
  'clawback',
  'refund',
  'payout',
]);
export type LedgerEntryTypeDto = z.infer<typeof ledgerEntryTypeSchema>;

export const ledgerOwnerTypeSchema = z.enum(['platform', 'tenant', 'partner', 'affiliate']);
export type LedgerOwnerTypeDto = z.infer<typeof ledgerOwnerTypeSchema>;

export const ledgerEntryResponseSchema = z.object({
  id: z.string(),
  journalId: z.string(),
  ownerType: ledgerOwnerTypeSchema,
  ownerId: z.string().nullable(),
  entryType: ledgerEntryTypeSchema,
  /** VND đồng digit strings. Exactly one of debit/credit is > 0. */
  debit: z.string(),
  credit: z.string(),
  bookingId: z.string().nullable(),
  paymentId: z.string().nullable(),
  payoutId: z.string().nullable(),
  memo: z.string().nullable(),
  createdAt: z.string(),
});
export type LedgerEntryResponse = z.infer<typeof ledgerEntryResponseSchema>;

/** Net balance for one ledger owner — `balance` = credit − debit (VND, signed). */
export const ownerBalanceResponseSchema = z.object({
  ownerType: ledgerOwnerTypeSchema,
  ownerId: z.string().nullable(),
  /** Signed VND đồng digit string. Positive = payable to the owner / owed by the tenant. */
  balance: z.string(),
  totalDebit: z.string(),
  totalCredit: z.string(),
});
export type OwnerBalanceResponse = z.infer<typeof ownerBalanceResponseSchema>;

/** Tenant finance overview (§13.3). All amounts are signed VND đồng digit strings. */
export const tenantFinanceSummaryResponseSchema = z.object({
  netRevenue: z.string(),
  partnerPayable: z.string(),
  affiliatePayable: z.string(),
  platformFeePayable: z.string(),
  partnerBalances: z.array(ownerBalanceResponseSchema),
  affiliateBalances: z.array(ownerBalanceResponseSchema),
});
export type TenantFinanceSummaryResponse = z.infer<typeof tenantFinanceSummaryResponseSchema>;

/** Partner finance view (§13.3): the partner's current payable + entry history. */
export const partnerFinanceResponseSchema = z.object({
  balance: z.string(),
  entries: z.array(ledgerEntryResponseSchema),
});
export type PartnerFinanceResponse = z.infer<typeof partnerFinanceResponseSchema>;

/** Platform finance view (§13.3): fee collected per tenant. */
export const platformFinanceResponseSchema = z.object({
  totalFeePayable: z.string(),
  perTenant: z.array(z.object({ tenantId: z.string(), feePayable: z.string() })),
});
export type PlatformFinanceResponse = z.infer<typeof platformFinanceResponseSchema>;

// ── Payouts ─────────────────────────────────────────────────────────────────

export const payoutPayeeTypeSchema = z.enum(['partner', 'affiliate']);
export type PayoutPayeeTypeDto = z.infer<typeof payoutPayeeTypeSchema>;

export const payoutStatusSchema = z.enum(['pending', 'processing', 'paid', 'failed']);
export type PayoutStatusDto = z.infer<typeof payoutStatusSchema>;

/** Payout cycle configured per tenant (§7.7): the cadence a payout run covers. */
export const payoutCycleSchema = z.enum(['weekly', 'monthly']);
export type PayoutCycleDto = z.infer<typeof payoutCycleSchema>;

export const createPayoutInputSchema = z.object({
  payeeType: payoutPayeeTypeSchema,
  payeeId: uuidSchema,
  /**
   * Override the tenant's configured payout cycle for this run (§7.7). When
   * omitted the tenant policy cycle applies; either way the run derives its
   * `period_from`/`period_to` window from the cycle when they are not supplied.
   */
  cycle: payoutCycleSchema.optional(),
  /** Optional explicit ISO window; when omitted it is derived from the cycle. */
  periodFrom: z.string().datetime().optional(),
  periodTo: z.string().datetime().optional(),
});
export type CreatePayoutInput = z.infer<typeof createPayoutInputSchema>;

export const markPayoutPaidInputSchema = z.object({
  /** Bank transfer reference number (§7.7). */
  reference: z.string().min(1).max(200),
  /** Optional uploaded evidence file key. */
  evidenceKey: z.string().max(500).optional(),
});
export type MarkPayoutPaidInput = z.infer<typeof markPayoutPaidInputSchema>;

export const failPayoutInputSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type FailPayoutInput = z.infer<typeof failPayoutInputSchema>;

export const payoutResponseSchema = z.object({
  id: z.string(),
  payeeType: payoutPayeeTypeSchema,
  payeeId: z.string(),
  /** VND đồng digit string. */
  amount: z.string(),
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  status: payoutStatusSchema,
  paidAt: z.string().nullable(),
  reference: z.string().nullable(),
  createdAt: z.string(),
});
export type PayoutResponse = z.infer<typeof payoutResponseSchema>;

// Re-export a couple of helpers so this file documents the shared money shape.
export { vndDigits as financeVndDigits, signedVndDigits as financeSignedVndDigits };
