import type { FilterSpec } from '~/lib/list-filters';

/** Filter controls for the promotions lists (tenant + partner share this). */
export const PROMOTION_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Tên hoặc mã khuyến mãi…' },
  {
    kind: 'enum',
    key: 'status',
    label: 'Trạng thái',
    options: [
      { value: 'draft', label: 'Nháp' },
      { value: 'active', label: 'Đang chạy' },
      { value: 'paused', label: 'Tạm dừng' },
      { value: 'ended', label: 'Đã kết thúc' },
    ],
  },
  { kind: 'date-range', fromKey: 'from', toKey: 'to', label: 'Ngày tạo' },
];
