import type { PaymentHistoryItem } from '@booking/contracts';

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
  mock: 'Giả lập',
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: 'Chuyển khoản ngân hàng',
  NAPAS_BANK_TRANSFER: 'Napas',
  MOMO_WALLET: 'Ví MoMo',
};
