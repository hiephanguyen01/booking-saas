import { createZodDto } from 'nestjs-zod';
import {
  approvePartnerInputSchema,
  createHousePartnerInputSchema,
  listPartnersQuerySchema,
  partnerApplyInputSchema,
  partnerResponseSchema,
  submitIdentityInputSchema,
  updatePartnerDocumentsInputSchema,
  updatePayoutInfoInputSchema,
  verifyIdentityInputSchema,
} from '@booking/contracts';

// Request bodies
export class PartnerApplyDto extends createZodDto(partnerApplyInputSchema) {}
export class CreateHousePartnerDto extends createZodDto(createHousePartnerInputSchema) {}
export class ApprovePartnerDto extends createZodDto(approvePartnerInputSchema) {}
export class UpdatePayoutInfoDto extends createZodDto(updatePayoutInfoInputSchema) {}
export class UpdatePartnerDocumentsDto extends createZodDto(updatePartnerDocumentsInputSchema) {}
export class SubmitIdentityDto extends createZodDto(submitIdentityInputSchema) {}
export class VerifyIdentityDto extends createZodDto(verifyIdentityInputSchema) {}

// Query
export class ListPartnersQueryDto extends createZodDto(listPartnersQuerySchema) {}

// Responses
export class PartnerResponseDto extends createZodDto(partnerResponseSchema) {}
