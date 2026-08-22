/**
 * Per-gateway money limits (VND). MoMo supports a single checkout/refund from
 * 1,000đ through 50,000,000đ. Checkout is capped to the refund ceiling so a
 * single MoMo payment remains refundable without gateway-level splitting.
 */
export const MOMO_MIN_PAYMENT_VND = 1_000n;
export const MOMO_MIN_REFUND_VND = MOMO_MIN_PAYMENT_VND;
export const MOMO_MAX_PAYMENT_VND = 50_000_000n;
