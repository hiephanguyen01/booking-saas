import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';
import { slugSchema } from './tenancy';

/** Partner classification (§7.3): a freelancer vs a registered company. */
export const partnerTypeSchema = z.enum(['individual', 'company']);
export type PartnerType = z.infer<typeof partnerTypeSchema>;

/** Onboarding lifecycle (§7.3): tenant approves, may later suspend. */
export const partnerStatusSchema = z.enum(['pending', 'approved', 'suspended']);
export type PartnerStatus = z.infer<typeof partnerStatusSchema>;

/** Identity-verification state for people-booking listing types (§7.3). */
export const partnerVerificationStatusSchema = z.enum([
  'unsubmitted',
  'pending',
  'verified',
  'rejected',
]);
export type PartnerVerificationStatus = z.infer<typeof partnerVerificationStatusSchema>;

export const identityDocumentTypeSchema = z.enum(['national_id', 'passport', 'driver_license']);
export type IdentityDocumentType = z.infer<typeof identityDocumentTypeSchema>;

/** Bank details for receiving payouts; `holderName` is matched against the ID name. */
export const payoutInfoSchema = z.object({
  bank: z.string().min(1).max(120),
  accountNumber: z.string().min(1).max(64),
  holderName: z.string().min(1).max(200),
});
export type PayoutInfo = z.infer<typeof payoutInfoSchema>;

// ── Inputs (validated identically on FE + BE) ────────────────────────────────

/** A logged-in user applies to become a partner under a tenant (self-signup). */
export const partnerApplyInputSchema = z.object({
  tenantId: uuidSchema,
  name: z.string().min(1).max(200),
  slug: slugSchema,
  partnerType: partnerTypeSchema.default('individual'),
  description: z.string().max(1000).optional(),
  businessInfo: z.record(z.unknown()).optional(),
  contactInfo: z.record(z.unknown()).optional(),
});
export type PartnerApplyInput = z.infer<typeof partnerApplyInputSchema>;

/** Tenant admin creates a house partner (tenant sells its own inventory). */
export const createHousePartnerInputSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(1000).optional(),
});
export type CreateHousePartnerInput = z.infer<typeof createHousePartnerInputSchema>;

/** Tenant approves a pending partner; records fee-schedule agreement acceptance. */
export const approvePartnerInputSchema = z.object({
  agreementVersion: z.string().min(1).max(40).optional(),
});
export type ApprovePartnerInput = z.infer<typeof approvePartnerInputSchema>;

export const updatePayoutInfoInputSchema = payoutInfoSchema;
export type UpdatePayoutInfoInput = z.infer<typeof updatePayoutInfoInputSchema>;

/** Partner submits ID document metadata + DOB for manual review (eKYC is Phase 3). */
export const submitIdentityInputSchema = z.object({
  documentType: identityDocumentTypeSchema,
  documentNumber: z.string().min(1).max(64),
  holderName: z.string().min(1).max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)'),
});
export type SubmitIdentityInput = z.infer<typeof submitIdentityInputSchema>;

/** Tenant admin's manual identity review; verifies unless under-18 / name mismatch. */
export const verifyIdentityInputSchema = z.object({
  note: z.string().max(1000).optional(),
});
export type VerifyIdentityInput = z.infer<typeof verifyIdentityInputSchema>;

/**
 * Post-registration document upload (§7.3). A partner registers with plain fields,
 * then — once authenticated — uploads a logo + license/business documents on the
 * dashboard. Persisted into `Partner.businessInfo` JSON (partners have no image
 * column). Free of `.transform()`/`.default()` so it can drive a GenericForm.
 */
export const updatePartnerDocumentsInputSchema = z.object({
  /** Public URL of the uploaded logo (via /uploads/presign, target `partners`). */
  logoUrl: z.string().url().or(z.literal('')).optional(),
  /** Public URLs of uploaded license/business documents. */
  licenseDocs: z.array(z.string().url()).max(20).optional(),
});
export type UpdatePartnerDocumentsInput = z.infer<typeof updatePartnerDocumentsInputSchema>;

export const listPartnersQuerySchema = paginationQuerySchema.extend({
  status: partnerStatusSchema.optional(),
});
export type ListPartnersQuery = z.infer<typeof listPartnersQuerySchema>;

/**
 * Storefront partner self-registration form (§7.3) — one schema covering the new
 * account, the partner record, and the licenses/business documents. Drives the
 * `become-partner` GenericForm on the client and is re-validated in its action.
 * Deliberately free of `.transform()`/`.default()` so input === output (a
 * GenericForm requirement); messages are Vietnamese (the storefront's market).
 */
export const partnerRegistrationSchema = z
  .object({
    // Account — mirrors registerInputSchema.
    fullName: z.string().min(1, 'Vui lòng nhập họ và tên').max(200),
    email: z.string().email('Email không hợp lệ'),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    phone: z.string().max(20).optional(),
    // Partner — mirrors partnerApplyInputSchema.
    name: z.string().min(1, 'Vui lòng nhập tên đối tác').max(200),
    slug: slugSchema,
    partnerType: partnerTypeSchema,
    description: z.string().max(1000, 'Giới thiệu tối đa 1000 ký tự').optional(),
    // Licenses & business documents (§7.3 business_info).
    legalName: z.string().max(200).optional(),
    taxId: z.string().max(64).optional(),
    businessRegistrationNo: z.string().max(64).optional(),
    licenseNo: z.string().max(120).optional(),
    /** One URL per line; parsed into `businessInfo.licenseDocs` server-side. */
    licenseDocs: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.partnerType === 'company') {
      if (!val.taxId?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taxId'], message: 'Doanh nghiệp cần mã số thuế' });
      if (!val.businessRegistrationNo?.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['businessRegistrationNo'],
          message: 'Doanh nghiệp cần số giấy phép kinh doanh',
        });
    }
    if (val.phone && val.phone.trim().length > 0 && val.phone.trim().length < 5)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Số điện thoại không hợp lệ' });
    if (val.licenseDocs) {
      const invalid = val.licenseDocs
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .some((u) => !/^https?:\/\/.+/i.test(u));
      if (invalid)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['licenseDocs'],
          message: 'Đường dẫn không hợp lệ (phải bắt đầu bằng http:// hoặc https://)',
        });
    }
  });
export type PartnerRegistrationInput = z.infer<typeof partnerRegistrationSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export interface PartnerResponse {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  partnerType: PartnerType;
  isHouse: boolean;
  status: PartnerStatus;
  verificationStatus: PartnerVerificationStatus;
  verifiedAt: string | null;
  dateOfBirth: string | null;
  payoutInfo: Record<string, unknown>;
  createdAt: string;
}
