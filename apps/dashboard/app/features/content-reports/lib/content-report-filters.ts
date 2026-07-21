import type { FilterSpec } from '~/lib/list-filters';

export const CONTENT_REPORT_FILTER_SPEC: FilterSpec = [
  {
    kind: 'text',
    key: 'q',
    label: 'Tìm kiếm',
    placeholder: 'Bài đăng, nhà cung cấp, người báo cáo…',
  },
  {
    kind: 'enum',
    key: 'target',
    label: 'Loại bài',
    allLabel: 'Tất cả loại bài',
    options: [
      { value: 'listing', label: 'Tin đăng' },
      { value: 'group', label: 'Tin nhiều hạng mục' },
    ],
  },
];
