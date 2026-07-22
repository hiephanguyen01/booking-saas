import type { CreatePlanInput, UpdatePlanInput } from '@booking/contracts';
import type { FieldConfig } from '@booking/ui/components/form/types';

/** GenericForm config for the create-plan card. */
export const planCreateFields: FieldConfig<CreatePlanInput>[] = [
  { name: 'name', type: 'text', label: 'Tên gói', placeholder: 'Studio Pro' },
  {
    name: 'priceMonthly',
    type: 'text',
    label: 'Giá / tháng (VND)',
    placeholder: '990000',
    description: 'Số nguyên đồng, không dấu chấm.',
  },
  { name: 'limits.maxPartners', type: 'number', label: 'Số partner tối đa' },
  { name: 'limits.maxListings', type: 'number', label: 'Số tin đăng tối đa' },
  { name: 'limits.maxBookingsPerMonth', type: 'number', label: 'Booking / tháng' },
  { name: 'limits.customDomain', type: 'switch', label: 'Cho phép tên miền riêng' },
  { name: 'limits.affiliateModule', type: 'switch', label: 'Bật module cộng tác viên' },
  { name: 'isActive', type: 'switch', label: 'Kích hoạt gói' },
];

/** GenericForm config for the edit-plan dialog. */
export const planEditFields: FieldConfig<UpdatePlanInput>[] = [
  { name: 'name', type: 'text', label: 'Tên gói' },
  {
    name: 'priceMonthly',
    type: 'text',
    label: 'Giá / tháng (VND)',
    description: 'Số nguyên đồng, không dấu chấm.',
  },
  { name: 'limits.maxPartners', type: 'number', label: 'Số partner tối đa' },
  { name: 'limits.maxListings', type: 'number', label: 'Số tin đăng tối đa' },
  { name: 'limits.maxBookingsPerMonth', type: 'number', label: 'Booking / tháng' },
  { name: 'limits.customDomain', type: 'switch', label: 'Cho phép tên miền riêng' },
  { name: 'limits.affiliateModule', type: 'switch', label: 'Bật module cộng tác viên' },
  { name: 'isActive', type: 'switch', label: 'Kích hoạt gói' },
  {
    name: 'repriceExistingSubscribers',
    type: 'switch',
    label: 'Áp giá mới cho người đăng ký hiện tại',
    description:
      'Bắt buộc khi đổi giá một gói đang có người đăng ký — giá mới áp cho tất cả họ ngay.',
  },
];
