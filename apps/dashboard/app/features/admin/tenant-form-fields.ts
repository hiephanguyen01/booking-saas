import {
  localeSchema,
  verticalSchema,
  type CreateTenantInput,
  type UpdateTenantInput,
} from '@booking/contracts';
import type { FieldConfig, FieldOption } from '@booking/ui/components/form/types';
import { LOCALE_LABELS, VERTICAL_LABELS } from '~/constants/tenancy';
import { TZ } from '~/constants/time';

// Select options derived from the contract enums + the shared label maps, so a
// new vertical/locale in @booking/contracts shows up here automatically.

export const VERTICAL_OPTIONS: FieldOption[] = verticalSchema.options.map((value) => ({
  label: VERTICAL_LABELS[value] ?? value,
  value,
}));

export const LOCALE_OPTIONS: FieldOption[] = localeSchema.options.map((value) => ({
  label: LOCALE_LABELS[value],
  value,
}));

/** GenericForm config for `routes/admin/tenants/new.tsx` (create tenant). */
export const tenantCreateFields: FieldConfig<CreateTenantInput>[] = [
  { name: 'name', type: 'text', label: 'Tên tenant', placeholder: 'Studio Ánh Dương', colSpan: 2 },
  {
    name: 'slug',
    type: 'text',
    label: 'Slug',
    placeholder: 'studio-anh-duong',
    description: 'Chữ thường, số và dấu gạch ngang. Dùng cho tên miền phụ mặc định.',
  },
  {
    name: 'vertical',
    type: 'select',
    label: 'Loại hình',
    options: VERTICAL_OPTIONS,
  },
  {
    name: 'defaultTimezone',
    type: 'text',
    label: 'Múi giờ mặc định',
    placeholder: TZ,
  },
  {
    name: 'defaultLocale',
    type: 'select',
    label: 'Ngôn ngữ mặc định',
    options: LOCALE_OPTIONS,
  },
];

/** GenericForm config for the tenant-edit card on `routes/admin/tenants/detail.tsx`. */
export const tenantEditFields: FieldConfig<UpdateTenantInput>[] = [
  { name: 'name', type: 'text', label: 'Tên tenant', colSpan: 2 },
  {
    name: 'vertical',
    type: 'select',
    label: 'Loại hình',
    options: VERTICAL_OPTIONS,
  },
  { name: 'defaultTimezone', type: 'text', label: 'Múi giờ' },
  {
    name: 'defaultLocale',
    type: 'select',
    label: 'Ngôn ngữ',
    options: LOCALE_OPTIONS,
  },
];
