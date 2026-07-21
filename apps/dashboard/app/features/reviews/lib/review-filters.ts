import type { FilterSpec } from '~/lib/list-filters';

/** Filter controls for the dashboard review inbox (admin/tenant/partner share this). */
export const REVIEW_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Khách hàng, booking, dịch vụ…' },
  {
    kind: 'enum',
    key: 'responseStatus',
    label: 'Phản hồi',
    allLabel: 'Tất cả phản hồi',
    options: [
      { value: 'pending', label: 'Chưa phản hồi' },
      { value: 'responded', label: 'Đã phản hồi' },
    ],
  },
  {
    kind: 'enum',
    key: 'rating',
    label: 'Số sao',
    allLabel: 'Tất cả số sao',
    options: [5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} sao` })),
  },
  { kind: 'date-range', fromKey: 'from', toKey: 'to', label: 'Ngày' },
];
