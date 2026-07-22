import { z } from 'zod';
import { paginationQuerySchema } from './common';

export const gatewayKeySchema = z.enum(['sepay', 'payos', 'momo', 'mock']);
export type GatewayKey = z.infer<typeof gatewayKeySchema>;

export const gatewayEnvironmentSchema = z.enum(['sandbox', 'production']);

export const sepayPaymentMethodSchema = z.enum(['BANK_TRANSFER', 'NAPAS_BANK_TRANSFER', 'CARD']);
export type SepayPaymentMethod = z.infer<typeof sepayPaymentMethodSchema>;

/** Provider-neutral choices exposed by the storefront. Provider codes stay in adapters. */
export const customerPaymentMethodSchema = z.enum([
  'bank_transfer',
  'napas_qr',
  'international_card',
  'momo_wallet',
]);
export type CustomerPaymentMethod = z.infer<typeof customerPaymentMethodSchema>;

/** Which storefront methods each gateway can actually process. */
export const GATEWAY_SUPPORTED_METHODS: Record<GatewayKey, CustomerPaymentMethod[]> = {
  sepay: ['bank_transfer', 'napas_qr', 'international_card'],
  payos: ['bank_transfer'],
  momo: ['momo_wallet'],
  mock: ['bank_transfer', 'napas_qr', 'international_card', 'momo_wallet'],
};

export const refundStrategySchema = z.enum(['manual', 'automatic_preferred']);
export type RefundStrategy = z.infer<typeof refundStrategySchema>;

export const gatewayPaymentSettingsSchema = z.object({
  enabledMethods: z.array(customerPaymentMethodSchema).min(1).max(4),
  refundStrategy: refundStrategySchema,
  manualRefundSlaHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
});
export type GatewayPaymentSettings = z.infer<typeof gatewayPaymentSettingsSchema>;

export const DEFAULT_GATEWAY_PAYMENT_SETTINGS: GatewayPaymentSettings = {
  enabledMethods: ['bank_transfer'],
  refundStrategy: 'manual',
  manualRefundSlaHours: 72,
};

/**
 * Sensible defaults when a gateway is first configured: enable exactly the methods
 * it supports, and turn on automatic refunds for gateways that can push money back
 * (MoMo wallet, SePay card). Tenants can still override via the settings card.
 */
export function defaultGatewayPaymentSettings(gateway: GatewayKey): GatewayPaymentSettings {
  const enabledMethods = GATEWAY_SUPPORTED_METHODS[gateway];
  return {
    enabledMethods: enabledMethods.length ? enabledMethods : ['bank_transfer'],
    refundStrategy: gateway === 'momo' || gateway === 'sepay' ? 'automatic_preferred' : 'manual',
    manualRefundSlaHours: 72,
  };
}

export const sepayGatewayConfigInputSchema = z.object({
  gateway: z.literal('sepay'),
  environment: gatewayEnvironmentSchema,
  credentials: z.object({
    merchantId: z.string().trim().min(1, 'Merchant ID là bắt buộc').max(100),
    secretKey: z.string().trim().min(16, 'Secret key phải có ít nhất 16 ký tự').max(500),
  }),
});
export type SepayGatewayConfigInput = z.infer<typeof sepayGatewayConfigInputSchema>;

export const sepayGatewaySettingsFormSchema = z.object({
  environment: gatewayEnvironmentSchema,
  merchantId: z.string().trim().min(1, 'Merchant ID là bắt buộc').max(100),
  secretKey: z.string().trim().min(16, 'Secret key phải có ít nhất 16 ký tự').max(500),
});
export type SepayGatewaySettingsForm = z.infer<typeof sepayGatewaySettingsFormSchema>;

/** MoMo credentials (partnerCode/accessKey/secretKey from MoMo Business). */
export const momoGatewayConfigInputSchema = z.object({
  gateway: z.literal('momo'),
  environment: gatewayEnvironmentSchema,
  credentials: z.object({
    partnerCode: z.string().trim().min(1, 'Partner Code là bắt buộc').max(100),
    accessKey: z.string().trim().min(1, 'Access Key là bắt buộc').max(200),
    secretKey: z.string().trim().min(16, 'Secret Key phải có ít nhất 16 ký tự').max(500),
  }),
});
export type MomoGatewayConfigInput = z.infer<typeof momoGatewayConfigInputSchema>;

export const momoGatewaySettingsFormSchema = z.object({
  environment: gatewayEnvironmentSchema,
  partnerCode: z.string().trim().min(1, 'Partner Code là bắt buộc').max(100),
  accessKey: z.string().trim().min(1, 'Access Key là bắt buộc').max(200),
  secretKey: z.string().trim().min(16, 'Secret Key phải có ít nhất 16 ký tự').max(500),
});
export type MomoGatewaySettingsForm = z.infer<typeof momoGatewaySettingsFormSchema>;

/** Tenant admin stores gateway credentials (encrypted at rest, §11.1). */
export const upsertGatewayConfigInputSchema = z.object({
  gateway: gatewayKeySchema,
  environment: gatewayEnvironmentSchema.default('sandbox'),
  credentials: z.record(z.string()).default({}),
  settings: gatewayPaymentSettingsSchema.optional(),
});
export type UpsertGatewayConfigInput = z.infer<typeof upsertGatewayConfigInputSchema>;

export const updateGatewayPaymentSettingsInputSchema = gatewayPaymentSettingsSchema;
export type UpdateGatewayPaymentSettingsInput = z.infer<
  typeof updateGatewayPaymentSettingsInputSchema
>;

export const publicPaymentOptionsSchema = z.object({
  methods: z.array(customerPaymentMethodSchema).min(1),
});
export type PublicPaymentOptions = z.infer<typeof publicPaymentOptionsSchema>;

export const startCheckoutInputSchema = z.object({
  paymentMethod: customerPaymentMethodSchema,
});
export type StartCheckoutInput = z.infer<typeof startCheckoutInputSchema>;

export const checkoutDestinationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('redirect'), paymentUrl: z.string() }),
  z.object({
    type: z.literal('form_post'),
    actionUrl: z.string().url(),
    fields: z.record(z.string()),
  }),
]);
export type CheckoutDestination = z.infer<typeof checkoutDestinationSchema>;

export const checkoutResponseSchema = z.object({
  paymentId: z.string(),
  destination: checkoutDestinationSchema,
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
  /** SePay merchant id (null for other gateways). */
  merchantId: z.string().nullable(),
  /** MoMo partner code (null for other gateways). */
  partnerCode: z.string().nullable().default(null),
  settings: gatewayPaymentSettingsSchema,
});
export type GatewayConfigResponse = z.infer<typeof gatewayConfigResponseSchema>;

export const paymentKindSchema = z.enum(['deposit', 'balance', 'full', 'security_deposit']);
export const paymentRecordStatusSchema = z.enum(['pending', 'succeeded', 'failed', 'expired']);

export const paymentHistoryQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: paymentRecordStatusSchema.optional(),
  kind: paymentKindSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PaymentHistoryQuery = z.infer<typeof paymentHistoryQuerySchema>;

export const paymentHistoryItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  tenantName: z.string().nullable(),
  bookingId: z.string().uuid(),
  bookingCode: z.string(),
  gateway: gatewayKeySchema,
  paymentMethod: z.string().nullable(),
  kind: paymentKindSchema,
  amount: z.string(),
  status: paymentRecordStatusSchema,
  gatewayOrderRef: z.string().nullable(),
  gatewayTxnId: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PaymentHistoryItem = z.infer<typeof paymentHistoryItemSchema>;

export const confirmManualRefundInputSchema = z.object({
  reference: z.string().trim().min(1, 'Mã tham chiếu là bắt buộc').max(200),
  evidenceKey: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});
export type ConfirmManualRefundInput = z.infer<typeof confirmManualRefundInputSchema>;

export const refundStatusSchema = z.enum(['pending', 'succeeded', 'failed', 'manual_required']);
export const refundResponseSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  paymentId: z.string().uuid(),
  amount: z.string(),
  status: refundStatusSchema,
  reason: z.string().nullable(),
  affectsBookingStatus: z.boolean(),
  gatewayRefundId: z.string().nullable(),
  reference: z.string().nullable(),
  executionMode: z.enum(['manual', 'automatic']),
  dueAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type RefundResponse = z.infer<typeof refundResponseSchema>;

export const refundHistoryQuerySchema = paginationQuerySchema.extend({
  status: refundStatusSchema.optional(),
});
export type RefundHistoryQuery = z.infer<typeof refundHistoryQuerySchema>;

export const refundHistoryItemSchema = refundResponseSchema.extend({
  bookingCode: z.string(),
  createdAt: z.string(),
});
export type RefundHistoryItem = z.infer<typeof refundHistoryItemSchema>;
