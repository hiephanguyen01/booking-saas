import { createZodDto } from 'nestjs-zod';
import {
  checkoutResponseSchema,
  gatewayConfigResponseSchema,
  genericWebhookAcknowledgementResponseSchema,
  paymentStatusResponseSchema,
  paymentHistoryItemSchema,
  paymentHistoryQuerySchema,
  confirmManualRefundInputSchema,
  refundResponseSchema,
  refundHistoryItemSchema,
  refundHistoryQuerySchema,
  publicPaymentOptionsSchema,
  startCheckoutInputSchema,
  paymentRoutingInputSchema,
  paymentRoutingResponseSchema,
  tenantRefundPolicySchema,
  updateTenantRefundPolicyInputSchema,
  zaloPayWebhookAcknowledgementResponseSchema,
  submitManualRefundDestinationInputSchema,
  acknowledgeManualRefundInputSchema,
  manualRefundStatusResponseSchema,
  manualRefundListQuerySchema,
  manualRefundListResponseSchema,
  manualRefundDetailResponseSchema,
  verifyManualRefundDestinationInputSchema,
  claimManualRefundInputSchema,
  reassignManualRefundInputSchema,
  submitManualRefundTransferInputSchema,
  createManualRefundEvidenceUploadInputSchema,
  manualRefundEvidenceUploadResponseSchema,
  rejectManualRefundInputSchema,
  manualRefundPrivateDetailsResponseSchema,
} from '@booking/contracts';

// Request bodies
export class PaymentHistoryQueryDto extends createZodDto(paymentHistoryQuerySchema) {}
export class ConfirmManualRefundDto extends createZodDto(confirmManualRefundInputSchema) {}
export class RefundHistoryQueryDto extends createZodDto(refundHistoryQuerySchema) {}
export class StartCheckoutDto extends createZodDto(startCheckoutInputSchema) {}
export class PaymentRoutingInputDto extends createZodDto(paymentRoutingInputSchema) {}
export class UpdateTenantRefundPolicyDto extends createZodDto(
  updateTenantRefundPolicyInputSchema,
) {}
export class SubmitManualRefundDestinationDto extends createZodDto(
  submitManualRefundDestinationInputSchema,
) {}
export class AcknowledgeManualRefundDto extends createZodDto(acknowledgeManualRefundInputSchema) {}
export class ManualRefundListQueryDto extends createZodDto(manualRefundListQuerySchema) {}
export class VerifyManualRefundDestinationDto extends createZodDto(verifyManualRefundDestinationInputSchema) {}
export class ClaimManualRefundDto extends createZodDto(claimManualRefundInputSchema) {}
export class ReassignManualRefundDto extends createZodDto(reassignManualRefundInputSchema) {}
export class SubmitManualRefundTransferDto extends createZodDto(submitManualRefundTransferInputSchema) {}
export class CreateManualRefundEvidenceUploadDto extends createZodDto(createManualRefundEvidenceUploadInputSchema) {}
export class RejectManualRefundDto extends createZodDto(rejectManualRefundInputSchema) {}

// Responses
export class CheckoutResponseDto extends createZodDto(checkoutResponseSchema) {}
export class PaymentStatusResponseDto extends createZodDto(paymentStatusResponseSchema) {}
export class GatewayConfigResponseDto extends createZodDto(gatewayConfigResponseSchema) {}
export class PaymentHistoryItemDto extends createZodDto(paymentHistoryItemSchema) {}
export class RefundResponseDto extends createZodDto(refundResponseSchema) {}
export class RefundHistoryItemDto extends createZodDto(refundHistoryItemSchema) {}
export class PublicPaymentOptionsDto extends createZodDto(publicPaymentOptionsSchema) {}
export class PaymentRoutingResponseDto extends createZodDto(paymentRoutingResponseSchema) {}
export class TenantRefundPolicyDto extends createZodDto(tenantRefundPolicySchema) {}
export class ManualRefundStatusResponseDto extends createZodDto(manualRefundStatusResponseSchema) {}
export class ManualRefundListResponseDto extends createZodDto(manualRefundListResponseSchema) {}
export class ManualRefundDetailResponseDto extends createZodDto(manualRefundDetailResponseSchema) {}
export class ManualRefundEvidenceUploadResponseDto extends createZodDto(manualRefundEvidenceUploadResponseSchema) {}
export class ManualRefundPrivateDetailsResponseDto extends createZodDto(manualRefundPrivateDetailsResponseSchema) {}

export class GenericWebhookAcknowledgementResponseDto extends createZodDto(
  genericWebhookAcknowledgementResponseSchema,
) {}
export class ZaloPayWebhookAcknowledgementResponseDto extends createZodDto(
  zaloPayWebhookAcknowledgementResponseSchema,
) {}
