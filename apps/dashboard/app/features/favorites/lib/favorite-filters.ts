import type { FilterSpec } from '~/lib/list-filters';

/** Filter controls for the dashboard favorites inbox (partner + tenant share this). */
export const FAVORITE_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Khách hàng hoặc tên dịch vụ…' },
  {
    kind: 'enum',
    key: 'target',
    label: 'Loại',
    allLabel: 'Tất cả',
    options: [
      { value: 'listing', label: 'Dịch vụ' },
      { value: 'group', label: 'Studio' },
    ],
  },
];
