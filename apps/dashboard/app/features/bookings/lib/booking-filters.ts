import type { FilterSpec } from '~/lib/list-filters';

/** Search + date-range controls for the booking lists (tenant + partner share this). */
export const BOOKINGS_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Khách hàng hoặc mã đặt chỗ…' },
  { kind: 'date-range', fromKey: 'from', toKey: 'to', label: 'Ngày' },
];
