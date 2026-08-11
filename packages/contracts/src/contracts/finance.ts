import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

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
  data: {
    appliesTo: CommissionAppliesToDto;
    listingTypeId?: string;
    categoryId?: string;
    partnerId?: string;
  },
  ctx: z.RefinementCtx,
): void {
  const need = (field: 'listingTypeId' | 'categoryId' | 'partnerId') => {
    if (!data[field]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required for appliesTo=${data.appliesTo}`,
      });
    }
  };
  if (data.appliesTo === 'listing_type') need('listingTypeId');
  if (data.appliesTo === 'category') need('categoryId');
  if (data.appliesTo === 'partner') need('partnerId');
}

function refinePercentRate(
  data: {
    tenantRateType?: RateTypeDto;
    tenantRate?: string;
    affiliateRateType?: RateTypeDto;
    affiliateRate?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.tenantRateType === 'percent' && data.tenantRate !== undefined) {
    const n = Number(data.tenantRate);
    if (n < 0 || n > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenantRate'],
        message: 'A percent tenant rate must be between 0 and 100',
      });
    }
  }
  if (data.affiliateRateType === 'percent' && data.affiliateRate !== undefined) {
    const n = Number(data.affiliateRate);
    if (n < 0 || n > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['affiliateRate'],
        message: 'A percent affiliate rate must be between 0 and 100',
      });
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
        {
          appliesTo: data.appliesTo,
          listingTypeId: data.listingTypeId,
          categoryId: data.categoryId,
          partnerId: data.partnerId,
        },
        ctx,
      );
    }
    refinePercentRate(data, ctx);
  });
export type UpdateCommissionRuleInput = z.infer<typeof updateCommissionRuleInputSchema>;

/**
 * Platform-admin-only: set a tenant's platform fee. Applies to EVERY rule the
 * tenant has, because an override copies the platform rate when it is created —
 * updating only the default would keep billing overridden partners the old fee.
 */
export const updatePlatformRateInputSchema = z.object({
  platformRate: z.number().int().min(0).max(100),
});
export type UpdatePlatformRateInput = z.infer<typeof updatePlatformRateInputSchema>;

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
  /**
   * Display name of the entry's owner, resolved server-side: `partners.name`,
   * the affiliate's user full name, or the tenant name. Null for the `platform`
   * owner (which has no `ownerId`) and for an owner whose record no longer
   * exists — render the `ownerType` label in that case rather than the raw id.
   */
  ownerName: z.string().nullable(),
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

/** Filters for the tenant ledger view (§13.3). All optional; ANDed together. */
export const ledgerQuerySchema = paginationQuerySchema.extend({
  /** Only entries referencing this booking. */
  bookingId: uuidSchema.optional(),
  ownerType: ledgerOwnerTypeSchema.optional(),
  entryType: ledgerEntryTypeSchema.optional(),
  /** Inclusive ISO lower bound on the entry's `createdAt`. */
  from: z.string().datetime().optional(),
  /** Inclusive ISO upper bound on the entry's `createdAt`. */
  to: z.string().datetime().optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

/**
 * Partner ledger view filters (`GET /partner/finance/ledger`). Same shape as the
 * tenant ledger minus `ownerType`/`bookingId`: the owner is FORCED to the partner
 * in scope server-side, never taken from the client.
 */
export const partnerLedgerQuerySchema = paginationQuerySchema.extend({
  entryType: ledgerEntryTypeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PartnerLedgerQuery = z.infer<typeof partnerLedgerQuerySchema>;

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

export const settlementStatusSchema = z.enum([
  'held',
  'dispute_window',
  'disputed',
  'refund_pending',
  'released',
  'refunded',
]);
export type SettlementStatusDto = z.infer<typeof settlementStatusSchema>;

export const settlementKindSchema = z.enum([
  'service_completed',
  'customer_no_show',
  'cancellation_fee',
]);

export const bookingSettlementResponseSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  tenantName: z.string().nullable(),
  bookingId: uuidSchema,
  paymentId: uuidSchema,
  partnerId: uuidSchema,
  status: settlementStatusSchema,
  kind: settlementKindSchema,
  bookingCode: z.string().nullable(),
  listingTitle: z.string().nullable(),
  customerName: z.string().nullable(),
  partnerName: z.string().nullable(),
  onlineHeldAmount: vndDigits,
  remainingHeldAmount: vndDigits,
  onsiteCollectedAmount: vndDigits,
  securityDepositHeld: vndDigits,
  tenantCommissionGross: vndDigits,
  tenantNetEarning: signedVndDigits,
  partnerGrossEarning: vndDigits,
  partnerPayable: vndDigits,
  platformFee: vndDigits,
  affiliateCommission: vndDigits,
  refundedAmount: vndDigits,
  retainedAmount: vndDigits,
  refundId: uuidSchema.nullable(),
  payoutPendingAmount: vndDigits,
  paidAmount: vndDigits,
  remainingPayableAmount: vndDigits,
  latestPayoutId: uuidSchema.nullable(),
  latestPayoutStatus: payoutStatusSchema.nullable(),
  latestPayoutReference: z.string().nullable(),
  latestPayoutPaidAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  disputeUntil: z.string().nullable(),
  releasedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BookingSettlementResponse = z.infer<typeof bookingSettlementResponseSchema>;

/** Partner-safe projection: no tenant net/platform/affiliate internals. */
export const partnerBookingSettlementResponseSchema = bookingSettlementResponseSchema.pick({
  id: true,
  bookingId: true,
  status: true,
  kind: true,
  bookingCode: true,
  listingTitle: true,
  partnerName: true,
  onlineHeldAmount: true,
  remainingHeldAmount: true,
  onsiteCollectedAmount: true,
  partnerGrossEarning: true,
  partnerPayable: true,
  refundedAmount: true,
  payoutPendingAmount: true,
  paidAmount: true,
  remainingPayableAmount: true,
  latestPayoutId: true,
  latestPayoutStatus: true,
  latestPayoutReference: true,
  latestPayoutPaidAt: true,
  completedAt: true,
  disputeUntil: true,
  releasedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type PartnerBookingSettlementResponse = z.infer<
  typeof partnerBookingSettlementResponseSchema
>;

/** Customer-safe custody state used to decide whether a dispute can be opened. */
export const customerBookingSettlementResponseSchema = bookingSettlementResponseSchema
  .pick({
    id: true,
    bookingId: true,
    status: true,
    kind: true,
    bookingCode: true,
    onlineHeldAmount: true,
    remainingHeldAmount: true,
    refundedAmount: true,
    retainedAmount: true,
    completedAt: true,
    disputeUntil: true,
    releasedAt: true,
    updatedAt: true,
  })
  .extend({
    /** One settlement gets one customer review; this prevents repeated partial-refund claims. */
    canOpenDispute: z.boolean(),
    /** A provider/manual transfer has been confirmed, including security-only refunds. */
    refundConfirmed: z.boolean(),
    dispute: z
      .object({
        id: uuidSchema,
        status: z.enum(['open', 'accepted', 'rejected', 'resolved']),
        resolution: z.enum(['release', 'full_refund', 'partial_refund']).nullable(),
        resolutionNote: z.string().nullable(),
        refundAmount: vndDigits,
        partnerResponse: z.string().nullable(),
        partnerRespondedAt: z.string().nullable(),
        resolvedAt: z.string().nullable(),
        createdAt: z.string(),
      })
      .nullable(),
  });
export type CustomerBookingSettlementResponse = z.infer<
  typeof customerBookingSettlementResponseSchema
>;

/**
 * Dispute eligibility for a whole booking list, in one call. The full
 * settlement projection is per-booking; a customer's history page would need
 * one request per row to decide whether to offer the button, so it reads this
 * slim shape instead and joins on `bookingId`.
 */
export const customerDisputeStateSchema = z.object({
  bookingId: uuidSchema,
  canOpenDispute: z.boolean(),
  disputeUntil: z.string().nullable(),
});
export type CustomerDisputeState = z.infer<typeof customerDisputeStateSchema>;

export const bookingSettlementsQuerySchema = paginationQuerySchema.extend({
  status: settlementStatusSchema.optional(),
  partnerId: uuidSchema.optional(),
});
export type BookingSettlementsQuery = z.infer<typeof bookingSettlementsQuerySchema>;

export const settlementSummaryResponseSchema = z.object({
  heldAmount: vndDigits,
  disputedAmount: vndDigits,
  heldPartnerPayableAmount: vndDigits,
  disputedPartnerPayableAmount: vndDigits,
  refundPendingAmount: vndDigits,
  releasedPayableAmount: vndDigits,
  payoutPendingAmount: vndDigits,
  paidAmount: vndDigits,
  remainingPayableAmount: vndDigits,
  counts: z.record(settlementStatusSchema, z.number().int().nonnegative()),
});
export type SettlementSummaryResponse = z.infer<typeof settlementSummaryResponseSchema>;

export const openSettlementDisputeInputSchema = z.object({
  bookingId: uuidSchema,
  reason: z.string().trim().min(10).max(2000),
  evidence: z.array(z.string().trim().max(500)).max(10).default([]),
});
export type OpenSettlementDisputeInput = z.infer<typeof openSettlementDisputeInputSchema>;

export const resolveSettlementDisputeInputSchema = z
  .object({
    resolution: z.enum(['release', 'full_refund', 'partial_refund']),
    refundAmount: vndDigits.optional(),
    note: z.string().trim().min(1).max(2000),
  })
  .superRefine((value, ctx) => {
    if (value.resolution === 'partial_refund' && !value.refundAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['refundAmount'],
        message: 'Partial refund amount is required',
      });
    }
  });
export type ResolveSettlementDisputeInput = z.infer<typeof resolveSettlementDisputeInputSchema>;

export const respondSettlementDisputeInputSchema = z.object({
  response: z.string().trim().min(10).max(2000),
});
export type RespondSettlementDisputeInput = z.infer<typeof respondSettlementDisputeInputSchema>;

export const settlementDisputeStatusSchema = z.enum(['open', 'accepted', 'rejected', 'resolved']);
export const settlementDisputeResponseSchema = z.object({
  id: uuidSchema,
  settlementId: uuidSchema,
  bookingId: uuidSchema,
  openedByUserId: uuidSchema,
  openedByRole: z.string(),
  bookingCode: z.string().nullable(),
  listingTitle: z.string().nullable(),
  customerName: z.string().nullable(),
  partnerName: z.string().nullable(),
  onlineHeldAmount: vndDigits,
  remainingHeldAmount: vndDigits,
  disputeUntil: z.string().nullable(),
  reason: z.string(),
  evidence: z.array(z.string()),
  partnerResponse: z.string().nullable(),
  partnerRespondedAt: z.string().nullable(),
  status: settlementDisputeStatusSchema,
  resolution: z.enum(['release', 'full_refund', 'partial_refund']).nullable(),
  resolutionNote: z.string().nullable(),
  refundAmount: vndDigits,
  resolvedBy: uuidSchema.nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SettlementDisputeResponse = z.infer<typeof settlementDisputeResponseSchema>;

export const adminSettlementDisputeResponseSchema = settlementDisputeResponseSchema.extend({
  tenantId: uuidSchema,
  tenantName: z.string(),
});
export type AdminSettlementDisputeResponse = z.infer<typeof adminSettlementDisputeResponseSchema>;

/** Partner-safe claim view: no raw customer/resolver user ids. */
export const partnerSettlementDisputeResponseSchema = settlementDisputeResponseSchema.omit({
  openedByUserId: true,
  resolvedBy: true,
});
export type PartnerSettlementDisputeResponse = z.infer<
  typeof partnerSettlementDisputeResponseSchema
>;

const settlementDisputeFiltersSchema = paginationQuerySchema.extend({
  status: settlementDisputeStatusSchema.optional(),
  responseStatus: z.enum(['pending', 'responded']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().trim().max(200).optional(),
});

export const tenantSettlementDisputesQuerySchema = settlementDisputeFiltersSchema.extend({
  partnerId: uuidSchema.optional(),
});
export type TenantSettlementDisputesQuery = z.infer<typeof tenantSettlementDisputesQuerySchema>;

export const partnerSettlementDisputesQuerySchema = settlementDisputeFiltersSchema;
export type PartnerSettlementDisputesQuery = z.infer<typeof partnerSettlementDisputesQuerySchema>;

export const adminSettlementDisputesQuerySchema = settlementDisputeFiltersSchema.extend({
  tenantId: uuidSchema.optional(),
});
export type AdminSettlementDisputesQuery = z.infer<typeof adminSettlementDisputesQuerySchema>;

/** Payout cycle configured per tenant (§7.7): the cadence a payout run covers. */
export const payoutCycleSchema = z.enum(['weekly', 'monthly']);
export type PayoutCycleDto = z.infer<typeof payoutCycleSchema>;

export const payoutPolicySchema = z.object({
  holdingDays: z.number().int().min(0).max(90),
  minAmount: vndDigits,
  cycle: payoutCycleSchema,
});
export type PayoutPolicyDto = z.infer<typeof payoutPolicySchema>;

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
  /** Bank transfer reference, set when the payout is marked paid. */
  reference: z.string().nullable(),
  /**
   * Storage key of the uploaded transfer evidence, set alongside `reference`.
   * Tenant audience only — the partner view nulls it (the key is not fetchable
   * without a presigned download, and it exposes internal storage layout).
   */
  evidenceKey: z.string().nullable(),
  /**
   * Why the transfer failed. Set only when `status === 'failed'`, and the only
   * explanation a failed payout carries — render it wherever a failed payout is
   * shown, or the row is unexplainable.
   */
  failureReason: z.string().nullable(),
  /**
   * User id that opened the run; null for automated runs. Tenant audience only —
   * the partner view nulls it, as it identifies a tenant-internal actor.
   */
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});
export type PayoutResponse = z.infer<typeof payoutResponseSchema>;

// ── Payable preview ─────────────────────────────────────────────────────────

/** `GET /tenant/finance/payable` selects the payee to preview. */
export const tenantPayableQuerySchema = z.object({
  payeeType: payoutPayeeTypeSchema,
  payeeId: uuidSchema,
});
export type TenantPayableQuery = z.infer<typeof tenantPayableQuerySchema>;

/**
 * The **true payable** for one payee (§7.7): exactly what `POST /tenant/finance/payouts`
 * would pay right now, plus every input that shaped it.
 *
 * `balance` (the raw ledger balance) is NOT what gets paid — a payout run pays
 * `available` = `maturePayable − outstanding`. Held settlements have no payable
 * journal yet, while pending/processing payout runs already claim released
 * payable. The UI must therefore show `available` and use `balance` only as context.
 */
export const tenantPayableResponseSchema = z.object({
  payeeType: payoutPayeeTypeSchema,
  payeeId: z.string(),
  /** Raw ledger balance (credit − debit), signed VND. Context only — not payable. */
  balance: signedVndDigits,
  /** Net payable recognized by released settlement journals, signed VND. */
  maturePayable: signedVndDigits,
  /** Already claimed by pending/processing runs, VND. Subtracted from the mature payable. */
  outstanding: vndDigits,
  /** `maturePayable − outstanding` — the amount a run opened now would pay. Signed. */
  available: signedVndDigits,
  /** Tenant policy: dispute buffer applied before a settlement journal is released. */
  holdingDays: z.number().int(),
  /** Tenant policy: minimum VND a run must reach. */
  minAmount: vndDigits,
  /** Tenant policy: the cadence a run covers. */
  cycle: payoutCycleSchema,
  /** Whether a payout run would be accepted right now. */
  eligible: z.boolean(),
  /** Why not — mirrors the exact code `POST payouts` would reject with. Null when eligible. */
  ineligibleReason: z.enum(['NOTHING_TO_PAY', 'BELOW_MINIMUM']).nullable(),
});
export type TenantPayableResponse = z.infer<typeof tenantPayableResponseSchema>;

// Re-export a couple of helpers so this file documents the shared money shape.
export { vndDigits as financeVndDigits, signedVndDigits as financeSignedVndDigits };
