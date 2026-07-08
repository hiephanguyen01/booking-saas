import type { StorefrontTenant } from '../lib/tenant.server';

/**
 * Tenant theming via CSS variables (TONG-QUAN.md §16): theme_config values
 * become --sf-* variables on <html>, and Tailwind utilities reference them —
 * one build, per-tenant look.
 */
export function themeStyle(theme: StorefrontTenant['theme']): Record<string, string> {
  return {
    '--sf-primary': theme.primary,
    '--sf-accent': theme.accent,
    '--sf-background': theme.background,
  };
}
