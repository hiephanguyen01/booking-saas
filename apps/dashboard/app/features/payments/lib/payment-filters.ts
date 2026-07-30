import { PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL } from '~/constants/payments';
import type { FilterSpec } from '~/lib/list-filters';

/** Filter controls for the payment transactions page (admin + tenant share this). */
export const PAYMENT_FILTER_SPEC: FilterSpec = [
  {
    kind: 'text',
    key: 'search',
    label: 'Tìm kiếm',
    placeholder: 'Mã đặt chỗ, hóa đơn hoặc giao dịch…',
  },
  {
    kind: 'enum',
    key: 'status',
    label: 'Trạng thái',
    options: Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
  },
  {
    kind: 'enum',
    key: 'kind',
    label: 'Loại',
    options: Object.entries(PAYMENT_KIND_LABEL).map(([value, label]) => ({ value, label })),
  },
  { kind: 'date-range', fromKey: 'from', toKey: 'to', label: 'Ngày giao dịch' },
];
