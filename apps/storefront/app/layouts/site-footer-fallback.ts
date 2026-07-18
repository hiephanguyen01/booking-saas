import type { ThemeConfigInput } from '@booking/contracts';

export type SocialKey = keyof NonNullable<ThemeConfigInput['socialLinks']>;

/**
 * The social networks the footer can render, in display order. Each one maps to a
 * `theme_config.socialLinks` field — a network with no tenant URL is not rendered,
 * so the footer never advertises a profile the tenant does not have.
 */
export const SOCIAL_PROFILES: ReadonlyArray<{
  name: string;
  tenantKey: SocialKey;
}> = [
  { name: 'Facebook', tenantKey: 'facebook' },
  { name: 'Instagram', tenantKey: 'instagram' },
  { name: 'TikTok', tenantKey: 'tiktok' },
  { name: 'YouTube', tenantKey: 'youtube' },
];
