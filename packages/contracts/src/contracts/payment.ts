import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from './common';

export const gatewayKeySchema = z.enum(['sepay', 'payos', 'momo', 'zalopay', 'mock']);
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
  'zalopay_wallet',
]);
export type CustomerPaymentMethod = z.infer<typeof customerPaymentMethodSchema>;

/**
 * Methods eligible for newly-created checkout attempts. `napas_qr` remains in the
 * parser/provider compatibility contracts so historical rows and settings still load.
 */
export const NEW_CHECKOUT_PAYMENT_METHODS = [
  'bank_transfer',
  'international_card',
  'momo_wallet',
  'zalopay_wallet',
] as const satisfies readonly CustomerPaymentMethod[];

export function isNewCheckoutPaymentMethod(method: CustomerPaymentMethod): boolean {
  return (NEW_CHECKOUT_PAYMENT_METHODS as readonly string[]).includes(method);
}

/** Which storefront methods each gateway can actually process. */
export const GATEWAY_SUPPORTED_METHODS: Record<GatewayKey, CustomerPaymentMethod[]> = {
  sepay: ['bank_transfer', 'napas_qr', 'international_card'],
  payos: ['bank_transfer'],
  momo: ['momo_wallet'],
  zalopay: ['zalopay_wallet'],
  mock: ['bank_transfer', 'napas_qr', 'international_card', 'momo_wallet', 'zalopay_wallet'],
};

export const paymentMethodRouteSchema = z
  .object({
    method: customerPaymentMethodSchema,
    gateway: gatewayKeySchema,
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((route, ctx) => {
    if (!GATEWAY_SUPPORTED_METHODS[route.gateway].includes(route.method)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gateway'],
        message: `${route.gateway} does not support ${route.method}`,
      });
    }
  });
export type PaymentMethodRoute = z.infer<typeof paymentMethodRouteSchema>;

export const paymentRoutingInputSchema = z
  .object({ routes: z.array(paymentMethodRouteSchema).max(5) })
  .strict()
  .superRefine(({ routes }, ctx) => {
    const seen = new Set<CustomerPaymentMethod>();
    routes.forEach((route, index) => {
      if (seen.has(route.method)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['routes', index, 'method'],
          message: `Duplicate route for ${route.method}`,
        });
      }
      seen.add(route.method);
    });
  });
export type PaymentRoutingInput = z.infer<typeof paymentRoutingInputSchema>;

export const paymentRoutingResponseSchema = z.object({
  routes: z.array(paymentMethodRouteSchema),
});
export type PaymentRoutingResponse = z.infer<typeof paymentRoutingResponseSchema>;

export const refundStrategySchema = z.enum(['manual', 'automatic_preferred']);
export type RefundStrategy = z.infer<typeof refundStrategySchema>;

export const tenantRefundPolicySchema = z
  .object({
    refundStrategy: refundStrategySchema,
    manualRefundSlaHours: z.number().int().min(1).max(720),
  })
  .strict();
export type TenantRefundPolicy = z.infer<typeof tenantRefundPolicySchema>;
export const updateTenantRefundPolicyInputSchema = tenantRefundPolicySchema;
export type UpdateTenantRefundPolicyInput = z.infer<typeof updateTenantRefundPolicyInputSchema>;

export const gatewayPaymentSettingsSchema = z.object({
  enabledMethods: z.array(customerPaymentMethodSchema).min(1).max(5),
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

/** Legacy gateway-settings default retained for historical Payment compatibility. */
export function defaultGatewayPaymentSettings(gateway: GatewayKey): GatewayPaymentSettings {
  const enabledMethods = GATEWAY_SUPPORTED_METHODS[gateway];
  return {
    enabledMethods: enabledMethods.length ? enabledMethods : ['bank_transfer'],
    refundStrategy:
      gateway === 'momo' || gateway === 'zalopay' || gateway === 'sepay'
        ? 'automatic_preferred'
        : 'manual',
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
export type SepayGatewayCredentials = SepayGatewayConfigInput['credentials'];

export const payosGatewayConfigInputSchema = z.object({
  gateway: z.literal('payos'),
  environment: gatewayEnvironmentSchema,
  credentials: z
    .object({
      clientId: z.string().trim().min(1).max(200),
      apiKey: z.string().trim().min(1).max(500),
      checksumKey: z.string().trim().min(16).max(500),
    })
    .strict(),
});
export type PayosGatewayConfigInput = z.infer<typeof payosGatewayConfigInputSchema>;
export type PayosGatewayCredentials = PayosGatewayConfigInput['credentials'];

export const sepayGatewaySettingsFormSchema = z.object({
  environment: gatewayEnvironmentSchema,
  merchantId: z.string().trim().min(1, 'Merchant ID là bắt buộc').max(100),
  secretKey: z.string().trim().min(16, 'Secret key phải có ít nhất 16 ký tự').max(500),
});
export type SepayGatewaySettingsForm = z.infer<typeof sepayGatewaySettingsFormSchema>;

export const payosGatewaySettingsFormSchema = z.object({
  environment: gatewayEnvironmentSchema,
  clientId: z.string().trim().min(1, 'Client ID là bắt buộc').max(200),
  apiKey: z.string().trim().min(1, 'API Key là bắt buộc').max(500),
  checksumKey: z.string().trim().min(16, 'Checksum Key phải có ít nhất 16 ký tự').max(500),
});
export type PayosGatewaySettingsForm = z.infer<typeof payosGatewaySettingsFormSchema>;

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
export type MomoGatewayCredentials = MomoGatewayConfigInput['credentials'];

export const momoGatewaySettingsFormSchema = z.object({
  environment: gatewayEnvironmentSchema,
  partnerCode: z.string().trim().min(1, 'Partner Code là bắt buộc').max(100),
  accessKey: z.string().trim().min(1, 'Access Key là bắt buộc').max(200),
  secretKey: z.string().trim().min(16, 'Secret Key phải có ít nhất 16 ký tự').max(500),
});
export type MomoGatewaySettingsForm = z.infer<typeof momoGatewaySettingsFormSchema>;

export const zalopayGatewayConfigInputSchema = z.object({
  gateway: z.literal('zalopay'),
  environment: gatewayEnvironmentSchema,
  credentials: z.object({
    appId: z.string().trim().regex(/^\d+$/, 'App ID là số').max(20),
    key1: z.string().trim().min(16, 'Key1 phải có ít nhất 16 ký tự').max(500),
    key2: z.string().trim().min(16, 'Key2 phải có ít nhất 16 ký tự').max(500),
  }),
});
export type ZalopayGatewayConfigInput = z.infer<typeof zalopayGatewayConfigInputSchema>;
export type ZalopayGatewayCredentials = ZalopayGatewayConfigInput['credentials'];

export const zalopayGatewaySettingsFormSchema = z.object({
  environment: gatewayEnvironmentSchema,
  appId: z.string().trim().regex(/^\d+$/, 'App ID là số').max(20),
  key1: z.string().trim().min(16, 'Key1 phải có ít nhất 16 ký tự').max(500),
  key2: z.string().trim().min(16, 'Key2 phải có ít nhất 16 ký tự').max(500),
});
export type ZalopayGatewaySettingsForm = z.infer<typeof zalopayGatewaySettingsFormSchema>;

export const mockGatewayConfigInputSchema = z.object({
  gateway: z.literal('mock'),
  environment: gatewayEnvironmentSchema,
  credentials: z.object({}).strict(),
});
export type MockGatewayConfigInput = z.infer<typeof mockGatewayConfigInputSchema>;
export type MockGatewayCredentials = MockGatewayConfigInput['credentials'];

/** Provider credential writes no longer carry current routing/refund policy. */
export const upsertGatewayConfigInputSchema = z.discriminatedUnion('gateway', [
  sepayGatewayConfigInputSchema,
  payosGatewayConfigInputSchema,
  momoGatewayConfigInputSchema,
  zalopayGatewayConfigInputSchema,
  mockGatewayConfigInputSchema,
]);
export type UpsertGatewayConfigInput = z.infer<typeof upsertGatewayConfigInputSchema>;
export type GatewayCredentialsFor<K extends GatewayKey> = Extract<
  UpsertGatewayConfigInput,
  { gateway: K }
>['credentials'];

/** Compatibility contract retained until the old combined write endpoint is removed. */
export const updateGatewayPaymentSettingsInputSchema = gatewayPaymentSettingsSchema.extend({
  gateway: gatewayKeySchema,
});
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

export const paymentKindSchema = z.enum(['deposit', 'balance', 'full', 'security_deposit']);

export const paymentStatusResponseSchema = z.object({
  bookingCode: z.string(),
  bookingStatus: z.string(),
  /** none = no payment yet. */
  paymentStatus: z.enum(['none', 'pending', 'succeeded', 'failed', 'expired']),
  paymentKind: paymentKindSchema.nullable(),
  paidAmount: z.string(),
});
export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>;

/**
 * Provider acknowledgement returned by the public webhook endpoint.
 * ZaloPay requires its own callback shape; the other gateways use the generic acknowledgement.
 */
export const genericWebhookAcknowledgementResponseSchema = z
  .object({ success: z.literal(true) })
  .strict();
export const zaloPayWebhookAcknowledgementResponseSchema = z
  .object({
    return_code: z.literal(1),
    return_message: z.literal('success'),
  })
  .strict();
export const webhookAcknowledgementResponseSchema = z.union([
  genericWebhookAcknowledgementResponseSchema,
  zaloPayWebhookAcknowledgementResponseSchema,
]);
export type WebhookAcknowledgementResponse = z.infer<typeof webhookAcknowledgementResponseSchema>;

export const gatewayConfigResponseSchema = z.object({
  gateway: gatewayKeySchema,
  environment: gatewayEnvironmentSchema,
  isActive: z.boolean(),
  /** SePay merchant id (null for other gateways). */
  merchantId: z.string().nullable(),
  /** MoMo partner code (null for other gateways). */
  partnerCode: z.string().nullable().default(null),
  /** ZaloPay app ID (null for other gateways). */
  appId: z.string().nullable().default(null),
  settings: gatewayPaymentSettingsSchema,
});
export type GatewayConfigResponse = z.infer<typeof gatewayConfigResponseSchema>;

export const gatewayConfigsResponseSchema = z.array(gatewayConfigResponseSchema);
export type GatewayConfigsResponse = z.infer<typeof gatewayConfigsResponseSchema>;

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

export const refundEvidenceSchema = z.object({
  reference: z.string().trim().max(200).optional(),
  evidenceKey: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});
export type RefundEvidence = z.infer<typeof refundEvidenceSchema>;

export const confirmManualRefundInputSchema = refundEvidenceSchema.extend({
  reference: z.string().trim().min(1, 'Mã tham chiếu là bắt buộc').max(200),
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

// ── Batch-level manual refund workflow ─────────────────────────────────────

export const manualRefundOperationStatusSchema = z.enum([
  'awaiting_details',
  'verification_required',
  'correction_required',
  'ready_for_transfer',
  'transfer_submitted',
  'transfer_rejected',
  'completed',
]);
export type ManualRefundOperationStatus = z.infer<typeof manualRefundOperationStatusSchema>;

export const manualRefundAccountVerificationResultSchema = z.enum([
  'matched',
  'mismatch',
  'unsupported',
  'error',
]);
export type ManualRefundAccountVerificationResult = z.infer<
  typeof manualRefundAccountVerificationResultSchema
>;

export const maskedManualRefundDestinationSchema = z
  .object({
    bankCode: z.string().min(2).max(20),
    accountNameMasked: z.string().min(1).max(200),
    accountNumberLast4: z.string().regex(/^\d{4}$/),
    isThirdParty: z.boolean(),
    consentRecordedAt: z.string().datetime().nullable(),
  })
  .strict();
export type MaskedManualRefundDestination = z.infer<typeof maskedManualRefundDestinationSchema>;

export const submitManualRefundDestinationInputSchema = z
  .object({
    bankCode: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[A-Z0-9_-]+$/),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{4,34}$/, 'Số tài khoản không hợp lệ'),
    accountName: z.string().trim().min(2).max(200),
    isThirdParty: z.boolean().default(false),
    thirdPartyConsent: z.boolean().default(false),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.isThirdParty && !input.thirdPartyConsent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thirdPartyConsent'],
        message: 'Phải xác nhận sự đồng ý khi dùng tài khoản của người khác',
      });
    }
  });
export type SubmitManualRefundDestinationInput = z.infer<
  typeof submitManualRefundDestinationInputSchema
>;

export const verifyManualRefundDestinationInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    outcome: z.literal('matched'),
    note: z.string().trim().min(3).max(1000),
  })
  .strict();
export type VerifyManualRefundDestinationInput = z.infer<
  typeof verifyManualRefundDestinationInputSchema
>;

export const claimManualRefundInputSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export type ClaimManualRefundInput = z.infer<typeof claimManualRefundInputSchema>;

export const reassignManualRefundInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    makerUserId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export type ReassignManualRefundInput = z.infer<typeof reassignManualRefundInputSchema>;

export const submitManualRefundTransferInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reference: z.string().trim().min(1).max(200),
    evidenceObjectKey: z.string().trim().min(1).max(500),
  })
  .strict();
export type SubmitManualRefundTransferInput = z.infer<typeof submitManualRefundTransferInputSchema>;

export const manualRefundEvidenceContentTypeSchema = z.enum([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
export const MAX_MANUAL_REFUND_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024;

export const createManualRefundEvidenceUploadInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    contentType: manualRefundEvidenceContentTypeSchema,
    sizeBytes: z.number().int().positive().max(MAX_MANUAL_REFUND_EVIDENCE_SIZE_BYTES),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type CreateManualRefundEvidenceUploadInput = z.infer<
  typeof createManualRefundEvidenceUploadInputSchema
>;

export const manualRefundEvidenceUploadResponseSchema = z
  .object({
    uploadUrl: z.string().url(),
    key: z.string().trim().min(1).max(500),
    expiresInSec: z.number().int().positive(),
    requiredHeaders: z
      .object({
        'content-type': manualRefundEvidenceContentTypeSchema,
        'if-none-match': z.literal('*'),
      })
      .strict(),
  })
  .strict();
export type ManualRefundEvidenceUploadResponse = z.infer<
  typeof manualRefundEvidenceUploadResponseSchema
>;

export const revealManualRefundPrivateDetailsInputSchema = z
  .object({ reason: z.string().trim().min(3).max(1000) })
  .strict();
export type RevealManualRefundPrivateDetailsInput = z.infer<
  typeof revealManualRefundPrivateDetailsInputSchema
>;

export const manualRefundPrivateDetailsResponseSchema = z
  .object({
    bankCode: z.string().min(2).max(20),
    accountName: z.string().min(1).max(200),
    accountNumber: z.string().regex(/^\d{4,34}$/),
    evidenceDownload: z
      .object({
        downloadUrl: z.string().url(),
        expiresInSec: z.number().int().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ManualRefundPrivateDetailsResponse = z.infer<
  typeof manualRefundPrivateDetailsResponseSchema
>;

export const approveManualRefundInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
export type ApproveManualRefundInput = z.infer<typeof approveManualRefundInputSchema>;

export const rejectManualRefundInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export type RejectManualRefundInput = z.infer<typeof rejectManualRefundInputSchema>;

export const reopenManualRefundInputSchema = rejectManualRefundInputSchema;
export type ReopenManualRefundInput = z.infer<typeof reopenManualRefundInputSchema>;

export const manualRefundCustomerAcknowledgementSchema = z.enum(['received', 'not_received']);
export const acknowledgeManualRefundInputSchema = z
  .object({
    acknowledgement: manualRefundCustomerAcknowledgementSchema,
    note: z.string().trim().max(1000).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export type AcknowledgeManualRefundInput = z.infer<typeof acknowledgeManualRefundInputSchema>;

export const manualRefundBreakGlassInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(10).max(1000),
    confirmation: z.literal('BREAK_GLASS'),
  })
  .strict();
export type ManualRefundBreakGlassInput = z.infer<typeof manualRefundBreakGlassInputSchema>;

export const manualRefundStatusResponseSchema = z
  .object({
    id: z.string().uuid(),
    refundBatchId: z.string().uuid(),
    bookingId: z.string().uuid(),
    bookingCode: z.string(),
    amount: z.string().regex(/^\d+$/),
    status: manualRefundOperationStatusSchema,
    version: z.number().int().positive(),
    destinationLocked: z.boolean(),
    destination: maskedManualRefundDestinationSchema.nullable(),
    verificationResult: manualRefundAccountVerificationResultSchema.nullable(),
    transferDueAt: z.string().datetime().nullable(),
    customerDetailsDueAt: z.string().datetime().nullable(),
    transferSubmittedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    customerAcknowledgement: manualRefundCustomerAcknowledgementSchema.nullable(),
    customerAcknowledgedAt: z.string().datetime().nullable(),
  })
  .strict();
export type ManualRefundStatusResponse = z.infer<typeof manualRefundStatusResponseSchema>;
export const manualRefundBookingResponseSchema = z.array(manualRefundStatusResponseSchema);
export type ManualRefundBookingResponse = z.infer<typeof manualRefundBookingResponseSchema>;

export const manualRefundWorkflowEnableResponseSchema = z
  .object({
    enabled: z.literal(true),
    createdOperations: z.number().int().nonnegative(),
  })
  .strict();
export type ManualRefundWorkflowEnableResponse = z.infer<
  typeof manualRefundWorkflowEnableResponseSchema
>;

export const manualRefundListQuerySchema = paginationQuerySchema.extend({
  status: manualRefundOperationStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  overdue: z
    .preprocess(
      (value) => (value === 'true' ? true : value === 'false' ? false : value),
      z.boolean(),
    )
    .optional(),
});
export type ManualRefundListQuery = z.infer<typeof manualRefundListQuerySchema>;

export const manualRefundListItemSchema = manualRefundStatusResponseSchema
  .omit({ customerAcknowledgement: true, customerAcknowledgedAt: true })
  .extend({
    makerUserId: z.string().uuid().nullable(),
    claimedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ManualRefundListItem = z.infer<typeof manualRefundListItemSchema>;
export const manualRefundListResponseSchema = paginatedSchema(manualRefundListItemSchema)
  .extend({ workflowEnabled: z.boolean() })
  .strict();
export type ManualRefundListResponse = z.infer<typeof manualRefundListResponseSchema>;

export const manualRefundEvidenceResponseSchema = z
  .object({
    present: z.boolean(),
    contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']).nullable(),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .nullable(),
    verifiedAt: z.string().datetime().nullable(),
  })
  .strict();

export const manualRefundDetailResponseSchema = manualRefundStatusResponseSchema
  .extend({
    makerUserId: z.string().uuid().nullable(),
    claimedAt: z.string().datetime().nullable(),
    transferReference: z.string().nullable(),
    transferSubmittedByUserId: z.string().uuid().nullable(),
    checkedByUserId: z.string().uuid().nullable(),
    checkedAt: z.string().datetime().nullable(),
    rejectionReason: z.string().nullable(),
    evidence: manualRefundEvidenceResponseSchema,
    ciphertextPurgedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ManualRefundDetailResponse = z.infer<typeof manualRefundDetailResponseSchema>;
