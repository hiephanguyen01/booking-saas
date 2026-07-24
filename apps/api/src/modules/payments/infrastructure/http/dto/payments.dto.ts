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
  updateGatewayPaymentSettingsInputSchema,
  zaloPayWebhookAcknowledgementResponseSchema,
} from '@booking/contracts';

// Request bodies
export class PaymentHistoryQueryDto extends createZodDto(paymentHistoryQuerySchema) {}
export class ConfirmManualRefundDto extends createZodDto(confirmManualRefundInputSchema) {}
export class RefundHistoryQueryDto extends createZodDto(refundHistoryQuerySchema) {}
export class StartCheckoutDto extends createZodDto(startCheckoutInputSchema) {}
export class UpdateGatewayPaymentSettingsDto extends createZodDto(
  updateGatewayPaymentSettingsInputSchema,
) {}

// Responses
export class CheckoutResponseDto extends createZodDto(checkoutResponseSchema) {}
export class PaymentStatusResponseDto extends createZodDto(paymentStatusResponseSchema) {}
export class GatewayConfigResponseDto extends createZodDto(gatewayConfigResponseSchema) {}
export class PaymentHistoryItemDto extends createZodDto(paymentHistoryItemSchema) {}
export class RefundResponseDto extends createZodDto(refundResponseSchema) {}
export class RefundHistoryItemDto extends createZodDto(refundHistoryItemSchema) {}
export class PublicPaymentOptionsDto extends createZodDto(publicPaymentOptionsSchema) {}

export class GenericWebhookAcknowledgementResponseDto extends createZodDto(
  genericWebhookAcknowledgementResponseSchema,
) {}
export class ZaloPayWebhookAcknowledgementResponseDto extends createZodDto(
  zaloPayWebhookAcknowledgementResponseSchema,
) {}
