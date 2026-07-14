import { z } from 'zod';

export const gatewayKeySchema = z.enum(['payos', 'mock']);
export type GatewayKey = z.infer<typeof gatewayKeySchema>;

export const gatewayEnvironmentSchema = z.enum(['sandbox', 'production']);

/** Tenant admin stores gateway credentials (encrypted at rest, §11.1). */
export const upsertGatewayConfigInputSchema = z.object({
  gateway: gatewayKeySchema,
  environment: gatewayEnvironmentSchema.default('sandbox'),
  credentials: z.record(z.string()).default({}),
});
export type UpsertGatewayConfigInput = z.infer<typeof upsertGatewayConfigInputSchema>;

export const checkoutResponseSchema = z.object({
  paymentId: z.string(),
  paymentUrl: z.string(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const paymentStatusResponseSchema = z.object({
  bookingCode: z.string(),
  bookingStatus: z.string(),
  /** none = no payment yet. */
  paymentStatus: z.enum(['none', 'pending', 'succeeded', 'failed', 'expired']),
  paidAmount: z.string(),
});
export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>;

export const gatewayConfigResponseSchema = z.object({
  gateway: gatewayKeySchema,
  environment: gatewayEnvironmentSchema,
  isActive: z.boolean(),
});
export type GatewayConfigResponse = z.infer<typeof gatewayConfigResponseSchema>;
