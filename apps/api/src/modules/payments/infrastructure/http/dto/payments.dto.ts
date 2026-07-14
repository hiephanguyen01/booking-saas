import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  checkoutResponseSchema,
  gatewayConfigResponseSchema,
  paymentStatusResponseSchema,
  upsertGatewayConfigInputSchema,
} from '@booking/contracts';

// Request bodies
export class UpsertGatewayConfigDto extends createZodDto(upsertGatewayConfigInputSchema) {}

// Responses
export class CheckoutResponseDto extends createZodDto(checkoutResponseSchema) {}
export class PaymentStatusResponseDto extends createZodDto(paymentStatusResponseSchema) {}
export class GatewayConfigResponseDto extends createZodDto(gatewayConfigResponseSchema) {}

// Ad-hoc responses
export class WebhookReceivedDto extends createZodDto(z.object({ received: z.literal(true) })) {}
