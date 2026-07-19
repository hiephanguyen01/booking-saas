import { createZodDto } from 'nestjs-zod';
import {
  bookingSettlementResponseSchema,
  bookingSettlementsQuerySchema,
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
  openSettlementDisputeInputSchema,
  adminSettlementDisputeResponseSchema,
  adminSettlementDisputesQuerySchema,
  resolveSettlementDisputeInputSchema,
  settlementDisputeResponseSchema,
  partnerBookingSettlementResponseSchema,
  customerBookingSettlementResponseSchema,
  partnerSettlementDisputeResponseSchema,
  settlementSummaryResponseSchema,
  payoutPolicySchema,
  respondSettlementDisputeInputSchema,
  tenantSettlementDisputesQuerySchema,
  partnerSettlementDisputesQuerySchema,
} from '@booking/contracts';

// Request bodies
export class CreateCommissionRuleDto extends createZodDto(createCommissionRuleInputSchema) {}
export class UpdateCommissionRuleDto extends createZodDto(updateCommissionRuleInputSchema) {}
export class CreatePayoutDto extends createZodDto(createPayoutInputSchema) {}
export class MarkPayoutPaidDto extends createZodDto(markPayoutPaidInputSchema) {}
export class FailPayoutDto extends createZodDto(failPayoutInputSchema) {}
export class OpenSettlementDisputeDto extends createZodDto(openSettlementDisputeInputSchema) {}
export class ResolveSettlementDisputeDto extends createZodDto(
  resolveSettlementDisputeInputSchema,
) {}
export class PayoutPolicyDto extends createZodDto(payoutPolicySchema) {}
export class RespondSettlementDisputeDto extends createZodDto(
  respondSettlementDisputeInputSchema,
) {}

// Query params
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
export class LedgerQueryDto extends createZodDto(ledgerQuerySchema) {}
export class PartnerLedgerQueryDto extends createZodDto(partnerLedgerQuerySchema) {}
export class TenantPayableQueryDto extends createZodDto(tenantPayableQuerySchema) {}
export class BookingSettlementsQueryDto extends createZodDto(bookingSettlementsQuerySchema) {}
export class TenantSettlementDisputesQueryDto extends createZodDto(
  tenantSettlementDisputesQuerySchema,
) {}
export class PartnerSettlementDisputesQueryDto extends createZodDto(
  partnerSettlementDisputesQuerySchema,
) {}

// Responses
export class CommissionRuleResponseDto extends createZodDto(commissionRuleResponseSchema) {}
export class LedgerEntryResponseDto extends createZodDto(ledgerEntryResponseSchema) {}
export class TenantFinanceSummaryResponseDto extends createZodDto(
  tenantFinanceSummaryResponseSchema,
) {}
export class PartnerFinanceResponseDto extends createZodDto(partnerFinanceResponseSchema) {}
export class PlatformFinanceResponseDto extends createZodDto(platformFinanceResponseSchema) {}
export class PayoutResponseDto extends createZodDto(payoutResponseSchema) {}
export class TenantPayableResponseDto extends createZodDto(tenantPayableResponseSchema) {}
export class BookingSettlementResponseDto extends createZodDto(bookingSettlementResponseSchema) {}
export class SettlementDisputeResponseDto extends createZodDto(settlementDisputeResponseSchema) {}
export class AdminSettlementDisputeResponseDto extends createZodDto(
  adminSettlementDisputeResponseSchema,
) {}
export class AdminSettlementDisputesQueryDto extends createZodDto(
  adminSettlementDisputesQuerySchema,
) {}
export class PartnerBookingSettlementResponseDto extends createZodDto(
  partnerBookingSettlementResponseSchema,
) {}
export class CustomerBookingSettlementResponseDto extends createZodDto(
  customerBookingSettlementResponseSchema,
) {}
export class PartnerSettlementDisputeResponseDto extends createZodDto(
  partnerSettlementDisputeResponseSchema,
) {}
export class SettlementSummaryResponseDto extends createZodDto(settlementSummaryResponseSchema) {}
