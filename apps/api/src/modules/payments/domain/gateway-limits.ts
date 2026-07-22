/**
 * Per-gateway money limits (VND). MoMo caps a single payment/refund at
 * 50,000,000đ and requires at least 1,000đ. We cap the checkout amount to the
 * refund cap so every MoMo payment stays fully refundable in one API call
 * (refund ≤ amount paid ≤ cap) — no multi-request refund splitting needed.
 */
export const MOMO_MIN_REFUND_VND = 1_000n;
export const MOMO_MAX_PAYMENT_VND = 50_000_000n;
