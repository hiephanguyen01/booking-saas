import type { ThemeConfigInput } from '@booking/contracts';
import { BRAND_DEFAULTS, brandSwatch, sanitizeBrandFont } from '@booking/ui/lib/brand-theme';

/**
 * Tenant theming via CSS variables (TONG-QUAN.md §16.2). The tenant's
 * `theme_config.colors` drive the shadcn brand tokens (`--background`/`--primary`/
 * `--ring`) so every `@booking/ui` component renders in the tenant brand — plus
 * the legacy `--sf-*` vars for hand-rolled classNames. Emitted once at SSR into
 * a `<style>:root{…}</style>` (see root.tsx), so a theme change needs no rebuild.
 *
 * `--accent` is deliberately NOT tenant-driven: in shadcn it is the neutral
 * hover/focus surface (dropdown-menu, select, command, calendar, sidebar, …), not
 * a brand token. The tenant accent stays available as `--sf-accent`.
 *
 * Channel resolution (sanitize → contrast → platform fallback) lives in
 * `@booking/ui/lib/brand-theme`, so the dashboard resolves an identical brand
 * from the same tenant config instead of keeping its own copy of the rules.
 */

const DEFAULT_FONT = "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif";

/**
 * Build the `:root { … }` CSS that overrides the shadcn base tokens per tenant.
 * Each channel is sanitized after the shared contract validates the payload shape.
 */
export function themeCss(theme: ThemeConfigInput): string {
  const primary = brandSwatch(theme.colors?.primary, BRAND_DEFAULTS.primary);
  const accent = brandSwatch(theme.colors?.accent, BRAND_DEFAULTS.accent);
  const background = brandSwatch(theme.colors?.background, BRAND_DEFAULTS.background);
  const font = sanitizeBrandFont(theme.font) ?? DEFAULT_FONT;
  const decls = [
    `--background:${background.color}`,
    `--foreground:${background.foreground}`,
    `--primary:${primary.color}`,
    `--primary-foreground:${primary.foreground}`,
    `--ring:${primary.color}`,
    `--font-tenant:${font}`,
    `--sf-primary:${primary.color}`,
    `--sf-accent:${accent.color}`,
    `--sf-background:${background.color}`,
    `--sf-primary-soft:color-mix(in oklch,${primary.color} 10%,${background.color})`,
    `--sf-accent-soft:color-mix(in oklch,${accent.color} 10%,${background.color})`,
  ];
  return `:root{${decls.join(';')}}`;
}
