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

export interface CheckoutResponse {
  paymentId: string;
  paymentUrl: string;
}

export interface PaymentStatusResponse {
  bookingCode: string;
  bookingStatus: string;
  /** none = no payment yet. */
  paymentStatus: 'none' | 'pending' | 'succeeded' | 'failed' | 'expired';
  paidAmount: string;
}

export interface GatewayConfigResponse {
  gateway: GatewayKey;
  environment: 'sandbox' | 'production';
  isActive: boolean;
}
