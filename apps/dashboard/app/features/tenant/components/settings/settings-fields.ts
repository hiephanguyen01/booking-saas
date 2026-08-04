import type {
  AddDomainInput,
  MomoGatewaySettingsForm,
  SepayGatewaySettingsForm,
  ThemeConfigInput,
  ZalopayGatewaySettingsForm,
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

export const momoGatewayFields: FieldConfig<MomoGatewaySettingsForm>[] = [
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
    name: 'partnerCode',
    type: 'text',
    label: 'Partner Code',
    placeholder: 'MOMO…',
    required: true,
  },
  {
    name: 'accessKey',
    type: 'text',
    label: 'Access Key',
    placeholder: 'Access Key từ MoMo Business',
    required: true,
  },
  {
    name: 'secretKey',
    type: 'password',
    label: 'Secret Key',
    description: 'Dùng để ký create/refund và xác thực IPN từ MoMo.',
    placeholder: 'Nhập Secret Key',
    autoComplete: 'new-password',
    required: true,
  },
];

export const zalopayGatewayFields: FieldConfig<ZalopayGatewaySettingsForm>[] = [
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
    name: 'appId',
    type: 'text',
    label: 'App ID',
    placeholder: '2553',
    required: true,
  },
  {
    name: 'key1',
    type: 'password',
    label: 'Key1',
    description: 'Ký create/refund/query gửi ZaloPay.',
    autoComplete: 'new-password',
    required: true,
  },
  {
    name: 'key2',
    type: 'password',
    label: 'Key2',
    description: 'Xác thực callback (IPN) từ ZaloPay.',
    autoComplete: 'new-password',
    required: true,
    colSpan: 2,
  },
];

const themeIdentityFields: FieldConfig<ThemeConfigInput>[] = [
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
  {
    name: 'colors.primary',
    type: 'color',
    label: 'Màu chủ đạo',
    description: 'Dùng cho nút chính và các điểm nhận diện thương hiệu.',
    placeholder: '#0f172a',
    presets: ['#0f172a', '#1d4ed8', '#0f766e', '#7c3aed', '#be123c', '#c2410c'],
  },
  {
    name: 'colors.accent',
    type: 'color',
    label: 'Màu nhấn',
    description: 'Dùng để làm nổi bật trạng thái và chi tiết quan trọng.',
    placeholder: '#f59e0b',
    presets: ['#f59e0b', '#e11d48', '#14b8a6', '#3b82f6', '#8b5cf6', '#84cc16'],
  },
  {
    name: 'colors.background',
    type: 'color',
    label: 'Màu nền',
    description:
      'Chọn nền tối và storefront tự chuyển sang bộ màu tối — thẻ, viền và chữ phụ suy theo độ sáng của nền.',
    placeholder: '#ffffff',
    presets: ['#ffffff', '#f8fafc', '#f5f5f4', '#fff7ed', '#0b1220', '#111827'],
  },
  { name: 'font', type: 'text', label: 'Phông chữ', placeholder: 'Inter' },
  {
    name: 'baseSize',
    type: 'text',
    label: 'Cỡ chữ nền',
    description: 'Từ 12px đến 20px. Mọi khoảng cách và chiều cao ô nhập đều giãn theo giá trị này.',
    placeholder: '16px',
  },
];

/**
 * Surface shape. Split from `themeFields` so the theme form can give it its own
 * section: these decide how the storefront *feels* (sharp or soft, dense or airy)
 * rather than what it says, and grouping them is what makes that legible.
 *
 * Every value is re-validated and clamped in `themeCss()` — the ranges quoted in
 * the descriptions are the clamps, not just advice.
 */
export const themeSurfaceFields: FieldConfig<ThemeConfigInput>[] = [
  {
    name: 'surface.radius',
    type: 'text',
    label: 'Bo góc',
    description: '0px đến 32px. Áp cho nút, ô nhập, thẻ và mọi thành phần giao diện.',
    placeholder: '10px',
  },
  {
    name: 'surface.imageRadius',
    type: 'text',
    label: 'Bo góc ảnh',
    description: '0px đến 32px. Dùng riêng cho thư viện ảnh và ảnh bìa.',
    placeholder: '8px',
  },
  {
    name: 'surface.borderWidth',
    type: 'text',
    label: 'Độ dày viền',
    description: '0px đến 4px. Đặt 0px để bỏ hẳn viền thẻ.',
    placeholder: '1px',
  },
  {
    name: 'surface.borderColor',
    type: 'color',
    label: 'Màu viền',
    description: 'Bỏ trống để viền tự suy theo màu nền.',
    placeholder: '#e5e7eb',
    presets: ['#e5e7eb', '#d4d4d8', '#cbd5e1', '#1f2937', '#000000'],
  },
  {
    name: 'surface.shadow',
    type: 'radio',
    variant: 'segmented',
    label: 'Đổ bóng',
    description: 'Chọn từ thang có sẵn — bóng tự nhập không được chấp nhận vì lý do bảo mật.',
    options: [
      { label: 'Không', value: 'none' },
      { label: 'Nhẹ', value: 'sm' },
      { label: 'Vừa', value: 'md' },
      { label: 'Rõ', value: 'lg' },
      { label: 'Đậm', value: 'xl' },
    ],
    colSpan: 2,
  },
  {
    name: 'surface.cardPadding',
    type: 'text',
    label: 'Đệm trong thẻ',
    description: '0px đến 48px. Quyết định thẻ trông đặc hay thoáng.',
    placeholder: '16px',
  },
  {
    name: 'surface.sectionGap',
    type: 'text',
    label: 'Khoảng cách khối',
    description: '0px đến 64px.',
    placeholder: '16px',
  },
];

const themeContentFields: FieldConfig<ThemeConfigInput>[] = [
  {
    name: 'hero.title',
    type: 'text',
    label: 'Tiêu đề hero',
    placeholder: 'Đặt chỗ nhanh chóng',
    colSpan: 2,
  },
  { name: 'hero.subtitle', type: 'textarea', label: 'Mô tả hero', rows: 2, colSpan: 2 },
  { name: 'hero.imageUrl', type: 'file', target: 'tenants', label: 'Ảnh nền hero', colSpan: 2 },
  {
    name: 'carousel',
    type: 'file',
    target: 'tenants',
    multiple: true,
    maxFiles: 10,
    label: 'Carousel trang chủ',
    description: 'Tối đa 10 ảnh, hiển thị dạng băng chuyền trên trang chủ.',
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
  { name: 'seo.title', type: 'text', label: 'Tiêu đề SEO', colSpan: 2 },
  { name: 'seo.description', type: 'textarea', label: 'Mô tả SEO', rows: 2, colSpan: 2 },
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

/**
 * One registration list for the whole theme form. `GenericForm` only binds the
 * fields it is handed, so the sections in `ThemeSettingsCard` place nodes out of
 * this array by name rather than each rendering their own form.
 */
export const themeFields: FieldConfig<ThemeConfigInput>[] = [
  ...themeIdentityFields,
  ...themeSurfaceFields,
  ...themeContentFields,
];

/** Expands the shared optional theme contract into controlled form defaults. */
export function toThemeDefaults(tc: ThemeConfigInput): ThemeConfigInput {
  return {
    logoUrl: tc.logoUrl ?? '',
    faviconUrl: tc.faviconUrl ?? '',
    baseSize: tc.baseSize ?? '',
    colors: {
      primary: tc.colors?.primary ?? '',
      accent: tc.colors?.accent ?? '',
      background: tc.colors?.background ?? '',
    },
    surface: {
      radius: tc.surface?.radius ?? '',
      imageRadius: tc.surface?.imageRadius ?? '',
      borderWidth: tc.surface?.borderWidth ?? '',
      borderColor: tc.surface?.borderColor ?? '',
      shadow: tc.surface?.shadow,
      cardPadding: tc.surface?.cardPadding ?? '',
      sectionGap: tc.surface?.sectionGap ?? '',
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
