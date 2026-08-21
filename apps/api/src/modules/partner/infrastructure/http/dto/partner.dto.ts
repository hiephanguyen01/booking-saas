import { createZodDto } from 'nestjs-zod';
import {
  approvePartnerInputSchema,
  createHousePartnerInputSchema,
  listPartnersQuerySchema,
  partnerApplyInputSchema,
  partnerAgreementListResponseSchema,
  partnerDocumentUploadInputSchema,
  partnerResponseSchema,
  partnerTaxAssessmentResponseSchema,
  partnerTaxYearQuerySchema,
  privateDocumentUploadResponseSchema,
  publicPartnerProfileResponseSchema,
  recordPartnerTaxDeclarationInputSchema,
  setDefaultCancellationPolicyInputSchema,
  submitIdentityInputSchema,
  updatePartnerDocumentsInputSchema,
  updatePayoutInfoInputSchema,
  updatePartnerTaxStatusInputSchema,
  verifyIdentityInputSchema,
} from '@booking/contracts';

// Request bodies
export class PartnerApplyDto extends createZodDto(partnerApplyInputSchema) {}
export class CreateHousePartnerDto extends createZodDto(createHousePartnerInputSchema) {}
export class ApprovePartnerDto extends createZodDto(approvePartnerInputSchema) {}
export class PartnerDocumentUploadDto extends createZodDto(partnerDocumentUploadInputSchema) {}
export class UpdatePayoutInfoDto extends createZodDto(updatePayoutInfoInputSchema) {}
export class UpdatePartnerTaxStatusDto extends createZodDto(updatePartnerTaxStatusInputSchema) {}
export class RecordPartnerTaxDeclarationDto extends createZodDto(
  recordPartnerTaxDeclarationInputSchema,
) {}
export class UpdatePartnerDocumentsDto extends createZodDto(updatePartnerDocumentsInputSchema) {}
export class SubmitIdentityDto extends createZodDto(submitIdentityInputSchema) {}
export class VerifyIdentityDto extends createZodDto(verifyIdentityInputSchema) {}
export class SetDefaultCancellationPolicyDto extends createZodDto(
  setDefaultCancellationPolicyInputSchema,
) {}

// Query
export class ListPartnersQueryDto extends createZodDto(listPartnersQuerySchema) {}
export class PartnerTaxYearQueryDto extends createZodDto(partnerTaxYearQuerySchema) {}

// Responses
export class PartnerResponseDto extends createZodDto(partnerResponseSchema) {}
export class PrivateDocumentUploadResponseDto extends createZodDto(
  privateDocumentUploadResponseSchema,
) {}
export class PartnerTaxAssessmentResponseDto extends createZodDto(
  partnerTaxAssessmentResponseSchema,
) {}
export class PartnerAgreementListResponseDto extends createZodDto(
  partnerAgreementListResponseSchema,
) {}
export class PublicPartnerProfileResponseDto extends createZodDto(
  publicPartnerProfileResponseSchema,
) {}
