import type {
  ManualRefundOperationStatus,
  PaymentHistoryItem,
  RefundHistoryItem,
} from '@booking/contracts';

export const PAYMENT_STATUS_LABEL: Record<PaymentHistoryItem['status'], string> = {
  pending: 'Chờ thanh toán',
  succeeded: 'Thành công',
  failed: 'Thất bại',
  expired: 'Hết hạn',
};

export const PAYMENT_KIND_LABEL: Record<PaymentHistoryItem['kind'], string> = {
  deposit: 'Tiền cọc',
  balance: 'Số dư còn lại',
  full: 'Thanh toán toàn bộ',
  security_deposit: 'Tiền thế chân',
};

export const PAYMENT_GATEWAY_LABEL: Record<PaymentHistoryItem['gateway'], string> = {
  sepay: 'SePay',
  payos: 'PayOS',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  mock: 'Giả lập',
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: 'Chuyển khoản ngân hàng',
  NAPAS_BANK_TRANSFER: 'Napas',
  MOMO_WALLET: 'Ví MoMo',
  ZALOPAY_WALLET: 'Ví ZaloPay',
  CARD: 'Visa / Mastercard / JCB',
};

/** Refund status → Vietnamese label (tenant payments refund panel). */
export const REFUND_STATUS_LABEL: Record<RefundHistoryItem['status'], string> = {
  pending: 'Đang xử lý',
  manual_required: 'Cần chuyển thủ công',
  succeeded: 'Đã hoàn',
  failed: 'Thất bại',
};

export const MANUAL_REFUND_STATUS_LABEL: Record<ManualRefundOperationStatus, string> = {
  awaiting_details: 'Chờ khách cung cấp',
  verification_required: 'Cần xác minh',
  correction_required: 'Cần khách chỉnh sửa',
  ready_for_transfer: 'Sẵn sàng chuyển',
  transfer_submitted: 'Chờ duyệt độc lập',
  transfer_rejected: 'Biên lai bị từ chối',
  completed: 'Đã hoàn tất',
};
