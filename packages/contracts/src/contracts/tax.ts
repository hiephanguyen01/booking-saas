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
export const tenantTaxCategorySchema = z.enum([
  'standard',
  'reduced_5',
  'exempt',
  'not_taxable',
]);
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

/** Tenant sets a partner's tax status — narrow on purpose; it changes money. */
export const updatePartnerTaxStatusInputSchema = z.object({
  taxStatus: partnerTaxStatusSchema,
});
export type UpdatePartnerTaxStatusInput = z.infer<typeof updatePartnerTaxStatusInputSchema>;
