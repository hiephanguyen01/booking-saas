import { createZodDto } from 'nestjs-zod';
import {
  commissionRuleResponseSchema,
  createCommissionRuleInputSchema,
  createPayoutInputSchema,
  failPayoutInputSchema,
  ledgerEntryResponseSchema,
  markPayoutPaidInputSchema,
  paginationQuerySchema,
  partnerFinanceResponseSchema,
  payoutResponseSchema,
  platformFinanceResponseSchema,
  tenantFinanceSummaryResponseSchema,
  updateCommissionRuleInputSchema,
} from '@booking/shared';

// Request bodies
export class CreateCommissionRuleDto extends createZodDto(createCommissionRuleInputSchema) {}
export class UpdateCommissionRuleDto extends createZodDto(updateCommissionRuleInputSchema) {}
export class CreatePayoutDto extends createZodDto(createPayoutInputSchema) {}
export class MarkPayoutPaidDto extends createZodDto(markPayoutPaidInputSchema) {}
export class FailPayoutDto extends createZodDto(failPayoutInputSchema) {}

// Query params
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}

// Responses
export class CommissionRuleResponseDto extends createZodDto(commissionRuleResponseSchema) {}
export class LedgerEntryResponseDto extends createZodDto(ledgerEntryResponseSchema) {}
export class TenantFinanceSummaryResponseDto extends createZodDto(tenantFinanceSummaryResponseSchema) {}
export class PartnerFinanceResponseDto extends createZodDto(partnerFinanceResponseSchema) {}
export class PlatformFinanceResponseDto extends createZodDto(platformFinanceResponseSchema) {}
export class PayoutResponseDto extends createZodDto(payoutResponseSchema) {}
