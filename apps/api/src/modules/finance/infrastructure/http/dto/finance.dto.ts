import { createZodDto } from 'nestjs-zod';
import {
  commissionRuleResponseSchema,
  createCommissionRuleInputSchema,
  createPayoutInputSchema,
  failPayoutInputSchema,
  ledgerEntryResponseSchema,
  ledgerQuerySchema,
  markPayoutPaidInputSchema,
  paginationQuerySchema,
  partnerLedgerQuerySchema,
  partnerFinanceResponseSchema,
  payoutResponseSchema,
  platformFinanceResponseSchema,
  tenantFinanceSummaryResponseSchema,
  tenantPayableQuerySchema,
  tenantPayableResponseSchema,
  updateCommissionRuleInputSchema,
} from '@booking/contracts';

// Request bodies
export class CreateCommissionRuleDto extends createZodDto(createCommissionRuleInputSchema) {}
export class UpdateCommissionRuleDto extends createZodDto(updateCommissionRuleInputSchema) {}
export class CreatePayoutDto extends createZodDto(createPayoutInputSchema) {}
export class MarkPayoutPaidDto extends createZodDto(markPayoutPaidInputSchema) {}
export class FailPayoutDto extends createZodDto(failPayoutInputSchema) {}

// Query params
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
export class LedgerQueryDto extends createZodDto(ledgerQuerySchema) {}
export class PartnerLedgerQueryDto extends createZodDto(partnerLedgerQuerySchema) {}
export class TenantPayableQueryDto extends createZodDto(tenantPayableQuerySchema) {}

// Responses
export class CommissionRuleResponseDto extends createZodDto(commissionRuleResponseSchema) {}
export class LedgerEntryResponseDto extends createZodDto(ledgerEntryResponseSchema) {}
export class TenantFinanceSummaryResponseDto extends createZodDto(tenantFinanceSummaryResponseSchema) {}
export class PartnerFinanceResponseDto extends createZodDto(partnerFinanceResponseSchema) {}
export class PlatformFinanceResponseDto extends createZodDto(platformFinanceResponseSchema) {}
export class PayoutResponseDto extends createZodDto(payoutResponseSchema) {}
export class TenantPayableResponseDto extends createZodDto(tenantPayableResponseSchema) {}
