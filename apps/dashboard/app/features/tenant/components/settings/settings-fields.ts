import type {
  AddDomainInput,
  SepayGatewaySettingsForm,
  ThemeConfigInput,
} from '@booking/contracts';
import { FAVICON_ACCEPT } from '@booking/ui/components/form/image-upload';
import type { FieldConfig } from '@booking/ui/components/form/types';

export const domainFields: FieldConfig<AddDomainInput>[] = [
  {
    name: 'hostname',
    type: 'text',
    label: 'Tên miền',
    placeholder: 'booking.cuahang.vn',
    colSpan: 2,
  },
  { name: 'isPrimary', type: 'switch', label: 'Đặt làm tên miền chính' },
];

export const sepayGatewayFields: FieldConfig<SepayGatewaySettingsForm>[] = [
  {
    name: 'environment',
    type: 'radio',
    label: 'Môi trường',
    variant: 'segmented',
    options: [
      { label: 'Sandbox', value: 'sandbox' },
      { label: 'Production', value: 'production' },
    ],
    colSpan: 2,
  },
  {
    name: 'merchantId',
    type: 'text',
    label: 'Merchant ID',
    placeholder: 'SP-…',
    required: true,
  },
  {
    name: 'secretKey',
    type: 'password',
    label: 'Merchant Secret Key',
    description: 'Dùng để ký checkout, gọi API và xác thực IPN từ SePay.',
    placeholder: 'Nhập Merchant Secret Key',
    autoComplete: 'new-password',
    required: true,
  },
];

export const themeFields: FieldConfig<ThemeConfigInput>[] = [
  {
    name: 'logoUrl',
    type: 'file',
    target: 'tenants',
    label: 'Logo',
    description: 'PNG/WebP nền trong suốt hoạt động tốt nhất.',
    colSpan: 2,
  },
  {
    name: 'faviconUrl',
    type: 'file',
    target: 'tenants',
    accept: FAVICON_ACCEPT,
    label: 'Favicon',
    description: 'Chấp nhận .ico, .png hoặc .webp.',
    colSpan: 2,
  },
  { name: 'colors.primary', type: 'text', label: 'Màu chủ đạo', placeholder: '#0f172a' },
  { name: 'colors.accent', type: 'text', label: 'Màu nhấn', placeholder: '#f59e0b' },
  { name: 'colors.background', type: 'text', label: 'Màu nền', placeholder: '#ffffff' },
  { name: 'font', type: 'text', label: 'Phông chữ', placeholder: 'Inter' },
  {
    name: 'hero.title',
    type: 'text',
    label: 'Hero — Tiêu đề',
    placeholder: 'Đặt chỗ nhanh chóng',
    colSpan: 2,
  },
  { name: 'hero.subtitle', type: 'textarea', label: 'Hero — Mô tả', rows: 2, colSpan: 2 },
  { name: 'hero.imageUrl', type: 'file', target: 'tenants', label: 'Hero — Ảnh nền', colSpan: 2 },
  {
    name: 'carousel',
    type: 'file',
    target: 'tenants',
    multiple: true,
    maxFiles: 10,
    label: 'Carousel trang chủ',
    description: 'Tối đa 10 ảnh — hiển thị dạng băng chuyền trên trang chủ.',
    colSpan: 2,
  },
  {
    name: 'contact.email',
    type: 'email',
    label: 'Email liên hệ',
    placeholder: 'lienhe@cuahang.vn',
  },
  { name: 'contact.phone', type: 'text', label: 'Số điện thoại', placeholder: '0900000000' },
  { name: 'contact.address', type: 'text', label: 'Địa chỉ', colSpan: 2 },
  { name: 'seo.title', type: 'text', label: 'SEO — Tiêu đề', colSpan: 2 },
  { name: 'seo.description', type: 'textarea', label: 'SEO — Mô tả', rows: 2, colSpan: 2 },
  {
    name: 'socialLinks.facebook',
    type: 'url',
    label: 'Facebook',
    placeholder: 'https://facebook.com/…',
  },
  {
    name: 'socialLinks.instagram',
    type: 'url',
    label: 'Instagram',
    placeholder: 'https://instagram.com/…',
  },
  {
    name: 'socialLinks.tiktok',
    type: 'url',
    label: 'TikTok',
    placeholder: 'https://tiktok.com/@…',
  },
  {
    name: 'socialLinks.youtube',
    type: 'url',
    label: 'YouTube',
    placeholder: 'https://youtube.com/@…',
  },
];

/** Expands the shared optional theme contract into controlled form defaults. */
export function toThemeDefaults(tc: ThemeConfigInput): ThemeConfigInput {
  return {
    logoUrl: tc.logoUrl ?? '',
    faviconUrl: tc.faviconUrl ?? '',
    colors: {
      primary: tc.colors?.primary ?? '',
      accent: tc.colors?.accent ?? '',
      background: tc.colors?.background ?? '',
    },
    font: tc.font ?? '',
    hero: {
      title: tc.hero?.title ?? '',
      subtitle: tc.hero?.subtitle ?? '',
      imageUrl: tc.hero?.imageUrl ?? '',
    },
    carousel: tc.carousel ?? [],
    contact: {
      email: tc.contact?.email ?? '',
      phone: tc.contact?.phone ?? '',
      address: tc.contact?.address ?? '',
    },
    seo: {
      title: tc.seo?.title ?? '',
      description: tc.seo?.description ?? '',
    },
    socialLinks: {
      facebook: tc.socialLinks?.facebook ?? '',
      instagram: tc.socialLinks?.instagram ?? '',
      tiktok: tc.socialLinks?.tiktok ?? '',
      youtube: tc.socialLinks?.youtube ?? '',
    },
  };
}
