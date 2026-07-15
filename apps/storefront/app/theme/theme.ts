import type { StorefrontTenant } from '../lib/tenant.server';

/**
 * Tenant theming via CSS variables (TONG-QUAN.md §16.2). The tenant's
 * `theme_config.colors` drive the shadcn design tokens (`--background`/`--primary`/
 * `--accent`/`--ring`) so every `@booking/ui` component renders in the tenant brand — plus
 * the legacy `--sf-*` vars for hand-rolled classNames. Emitted once at SSR into
 * a `<style>:root{…}</style>` (see root.tsx), so a theme change needs no rebuild.
 */

const DEFAULTS = { primary: '#0ea5e9', accent: '#f97316', background: '#ffffff' } as const;

/** Foreground tokens reused verbatim from `@booking/ui` globals.css. */
const FG_DARK = 'oklch(0.145 0 0)'; // near-black — on light brand colors
const FG_LIGHT = 'oklch(0.985 0 0)'; // near-white — on dark brand colors

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_RE = /^(?:rgb|rgba|hsl|hsla|oklch|oklab)\(\s*[0-9a-z.%,/ +-]+\s*\)$/i;

/**
 * Validate an untrusted tenant color string before it enters a `<style>` block.
 * Accepts only hex or a safe CSS color function; the character classes exclude
 * `;{}<>"'\@`, `url(`, and `expression(`, which defeats CSS/HTML/`</style>`
 * injection. Returns the trimmed value, or null when it isn't a safe color.
 */
export function sanitizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length === 0 || v.length > 64) return null;
  if (HEX_RE.test(v) || FUNC_RE.test(v)) return v;
  return null;
}

/** Expand `#rgb`/`#rgba` shorthand to full form; returns null for non-hex input. */
function expandHex(hex: string): string | null {
  if (!hex.startsWith('#')) return null;
  const body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    return `#${body.slice(0, 3).split('').map((c) => c + c).join('')}`;
  }
  if (body.length === 6 || body.length === 8) return `#${body.slice(0, 6)}`;
  return null;
}

/** sRGB channel → linear, for WCAG relative luminance. */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Pick a readable foreground (near-black / near-white) for a background color.
 * Only hex is measurable; a valid non-hex color (rare) falls back to near-white,
 * which suits the typical mid-to-dark brand primary/accent.
 */
export function contrastToken(color: string): string {
  const hex = expandHex(color);
  if (!hex) return FG_LIGHT;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.5 ? FG_DARK : FG_LIGHT;
}

/**
 * Build the `:root { … }` CSS that overrides the shadcn base tokens per tenant.
 * Each channel is re-sanitized defensively (idempotent with readTheme) and falls
 * back to the platform default when missing/invalid.
 */
export function themeCss(theme: StorefrontTenant['theme']): string {
  const primary = sanitizeColor(theme.primary) ?? DEFAULTS.primary;
  const accent = sanitizeColor(theme.accent) ?? DEFAULTS.accent;
  const background = sanitizeColor(theme.background) ?? DEFAULTS.background;
  const decls = [
    `--background:${background}`,
    `--foreground:${contrastToken(background)}`,
    `--primary:${primary}`,
    `--primary-foreground:${contrastToken(primary)}`,
    `--accent:${accent}`,
    `--accent-foreground:${contrastToken(accent)}`,
    `--ring:${primary}`,
    `--sf-primary:${primary}`,
    `--sf-accent:${accent}`,
    `--sf-background:${background}`,
  ];
  return `:root{${decls.join(';')}}`;
}
