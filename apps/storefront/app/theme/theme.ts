import type { ThemeConfigInput } from '@booking/contracts';
import {
  brandContrastForeground,
  sanitizeBrandColor,
  sanitizeBrandFont,
} from '@booking/ui/lib/brand-theme';

/**
 * Tenant theming via CSS variables (TONG-QUAN.md §16.2). The tenant's
 * `theme_config.colors` drive the shadcn brand tokens (`--background`/`--primary`/
 * `--ring`) so every `@booking/ui` component renders in the tenant brand — plus
 * the legacy `--sf-*` vars for hand-rolled classNames. The sanitized output is
 * served from the tenant-scoped `/theme.css` resource route, so a theme change
 * needs no application rebuild and document CSP does not require inline styles.
 *
 * `--accent` is deliberately NOT tenant-driven: in shadcn it is the neutral
 * hover/focus surface (dropdown-menu, select, command, calendar, sidebar, …), not
 * a brand token. The tenant accent stays available as `--sf-accent`.
 */

const DEFAULTS = { primary: '#0ea5e9', accent: '#f97316', background: '#ffffff' } as const;
const DEFAULT_FONT = "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif";
/** Foreground tokens reused verbatim from `@booking/ui` globals.css. */
const FG_DARK = 'oklch(0.145 0 0)'; // near-black — on light brand colors

/**
 * Resolve one untrusted tenant channel to a color plus its readable foreground.
 * A color we cannot measure is treated as invalid — falling back to the platform
 * default keeps the pair readable instead of shipping an unreadable brand.
 */
function swatch(value: unknown, fallback: string): { color: string; foreground: string } {
  const color = sanitizeBrandColor(value);
  const foreground = color === null ? null : brandContrastForeground(color);
  if (color !== null && foreground !== null) return { color, foreground };
  // DEFAULTS are hex, so contrastToken always measures them.
  return { color: fallback, foreground: brandContrastForeground(fallback) ?? FG_DARK };
}

/**
 * Build the `:root { … }` CSS that overrides the shadcn base tokens per tenant.
 * Each channel is sanitized after the shared contract validates the payload shape.
 */
export function themeCss(theme: ThemeConfigInput): string {
  const primary = swatch(theme.colors?.primary, DEFAULTS.primary);
  const accent = swatch(theme.colors?.accent, DEFAULTS.accent);
  const background = swatch(theme.colors?.background, DEFAULTS.background);
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