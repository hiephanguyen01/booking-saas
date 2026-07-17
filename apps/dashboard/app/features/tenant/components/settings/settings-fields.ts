import type { AddDomainInput, ThemeConfigInput } from '@booking/contracts';
import { FAVICON_ACCEPT } from '@booking/ui/components/form/image-upload';
import type { FieldConfig } from '@booking/ui/components/form/types';

/** `GET /tenant/theme` response shape (no contract schema exists for it yet). */
export interface TenantThemeResponse {
  name: string;
  vertical: string;
  defaultLocale: string;
  themeConfig: Record<string, unknown>;
}

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

/** Reads `theme_config` (a free-form JSON blob) into typed form defaults. */
export function toThemeDefaults(tc: Record<string, unknown>): ThemeConfigInput {
  const s = (v: unknown): string => (typeof v === 'string' ? v : '');
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const colors = obj(tc.colors);
  const hero = obj(tc.hero);
  const contact = obj(tc.contact);
  const seo = obj(tc.seo);
  const social = obj(tc.socialLinks);
  const carousel = Array.isArray(tc.carousel)
    ? tc.carousel.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    logoUrl: s(tc.logoUrl),
    faviconUrl: s(tc.faviconUrl),
    colors: {
      primary: s(colors.primary),
      accent: s(colors.accent),
      background: s(colors.background),
    },
    font: s(tc.font),
    hero: { title: s(hero.title), subtitle: s(hero.subtitle), imageUrl: s(hero.imageUrl) },
    carousel,
    contact: { email: s(contact.email), phone: s(contact.phone), address: s(contact.address) },
    seo: { title: s(seo.title), description: s(seo.description) },
    socialLinks: {
      facebook: s(social.facebook),
      instagram: s(social.instagram),
      tiktok: s(social.tiktok),
      youtube: s(social.youtube),
    },
  };
}
