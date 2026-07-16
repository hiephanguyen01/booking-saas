import type { StorefrontTenant } from '../lib/tenant.server';

/**
 * The social networks the footer can render, in display order. Each one maps to a
 * `theme_config.socialLinks` field — a network with no tenant URL is not rendered,
 * so the footer never advertises a profile the tenant does not have.
 *
 * `tiktok`/`youtube` exist in the tenant contract but have no icon asset yet.
 */
export const SOCIAL_PROFILES: ReadonlyArray<{
  name: string;
  src: string;
  tenantKey: keyof StorefrontTenant['social'];
}> = [
  { name: 'Facebook', src: '/images/booking-studio/facebook.svg', tenantKey: 'facebook' },
  { name: 'Instagram', src: '/images/booking-studio/instagram.svg', tenantKey: 'instagram' },
];
