import { createZodDto } from 'nestjs-zod';
import {
  approvePartnerInputSchema,
  createHousePartnerInputSchema,
  listPartnersQuerySchema,
  partnerApplyInputSchema,
  partnerAgreementListResponseSchema,
  partnerResponseSchema,
  publicPartnerProfileResponseSchema,
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
export class UpdatePayoutInfoDto extends createZodDto(updatePayoutInfoInputSchema) {}
export class UpdatePartnerTaxStatusDto extends createZodDto(updatePartnerTaxStatusInputSchema) {}
export class UpdatePartnerDocumentsDto extends createZodDto(updatePartnerDocumentsInputSchema) {}
export class SubmitIdentityDto extends createZodDto(submitIdentityInputSchema) {}
export class VerifyIdentityDto extends createZodDto(verifyIdentityInputSchema) {}
export class SetDefaultCancellationPolicyDto extends createZodDto(
  setDefaultCancellationPolicyInputSchema,
) {}

// Query
export class ListPartnersQueryDto extends createZodDto(listPartnersQuerySchema) {}

// Responses
export class PartnerResponseDto extends createZodDto(partnerResponseSchema) {}
export class PartnerAgreementListResponseDto extends createZodDto(
  partnerAgreementListResponseSchema,
) {}
export class PublicPartnerProfileResponseDto extends createZodDto(
  publicPartnerProfileResponseSchema,
) {}
