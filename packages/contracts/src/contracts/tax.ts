import { z } from 'zod';

/**
 * The VAT categories a TENANT may pick for a listing type.
 *
 * Deliberately excludes `percentage_service`: that belongs to the
 * tỷ-lệ-%-trên-doanh-thu regime, which is selected by WHO sells, not by what is
 * sold. A household on that method has one service rate whatever its listing
 * type says, so offering it here would let a tenant set a rate the resolver
 * ignores. See `docs/features/vat.md`.
 */
export const tenantTaxCategorySchema = z.enum(['standard', 'reduced_5', 'exempt', 'not_taxable']);
export type TenantTaxCategory = z.infer<typeof tenantTaxCategorySchema>;

/**
 * A seller's tax status. It decides both the VAT regime (deduction vs
 * percentage) and — once NĐ 117 withholding ships — whether the tenant withholds
 * from their payout.
 */
export const partnerTaxStatusSchema = z.enum([
  'company_vat',
  'household_declaring',
  'household_below_threshold',
  'individual',
]);
export type PartnerTaxStatus = z.infer<typeof partnerTaxStatusSchema>;

/** Tenant break-glass override — normal household transitions are automatic. */
export const updatePartnerTaxStatusInputSchema = z.object({
  taxStatus: partnerTaxStatusSchema,
  reason: z.string().trim().min(3).max(500),
});
export type UpdatePartnerTaxStatusInput = z.infer<typeof updatePartnerTaxStatusInputSchema>;

export const partnerTaxAssessmentStatusSchema = z.enum([
  'missing_declaration',
  'below_threshold',
  'exceeded',
  'manual_review',
]);
export type PartnerTaxAssessmentStatus = z.infer<typeof partnerTaxAssessmentStatusSchema>;

export const partnerTaxClassificationSourceSchema = z.enum([
  'automatic_threshold',
  'external_declaration',
  'manual_override',
  'legal_rule',
]);
export type PartnerTaxClassificationSource = z.infer<typeof partnerTaxClassificationSourceSchema>;

export const partnerTaxYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
});
export type PartnerTaxYearQuery = z.infer<typeof partnerTaxYearQuerySchema>;

export const recordPartnerTaxDeclarationInputSchema = z.object({
  taxYear: z.coerce.number().int().min(2000).max(2200),
  /** Revenue outside BookingOS, VND đồng digit string. Latest declaration replaces the projection. */
  externalRevenue: z.string().regex(/^\d+$/),
  note: z.string().trim().max(500).optional(),
});
export type RecordPartnerTaxDeclarationInput = z.infer<
  typeof recordPartnerTaxDeclarationInputSchema
>;

export const partnerTaxAssessmentResponseSchema = z.object({
  partnerId: z.string().uuid(),
  taxYear: z.number().int(),
  status: partnerTaxAssessmentStatusSchema,
  taxStatus: partnerTaxStatusSchema,
  classificationSource: partnerTaxClassificationSourceSchema,
  platformRevenue: z.string().regex(/^\d+$/),
  externalRevenue: z.string().regex(/^\d+$/),
  totalRevenue: z.string().regex(/^\d+$/),
  thresholdAmount: z.string().regex(/^\d+$/),
  remainingAmount: z.string().regex(/^\d+$/),
  legalRef: z.string(),
  thresholdRevision: z.number().int(),
  crossedAt: z.string().datetime().nullable(),
  crossedQuarter: z.number().int().min(1).max(4).nullable(),
  declarationUpdatedAt: z.string().datetime().nullable(),
  manualOverrideStatus: partnerTaxStatusSchema.nullable(),
  manualOverrideReason: z.string().nullable(),
  manualOverrideUntil: z.string().datetime().nullable(),
  evaluatedAt: z.string().datetime(),
});
export type PartnerTaxAssessmentResponse = z.infer<typeof partnerTaxAssessmentResponseSchema>;
