import type { ThemeConfigInput } from '@booking/contracts';

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
 */

const DEFAULTS = { primary: '#0ea5e9', accent: '#f97316', background: '#ffffff' } as const;
const DEFAULT_FONT = "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif";
const GENERIC_FONTS = new Set([
  'cursive',
  'fantasy',
  'monospace',
  'sans-serif',
  'serif',
  'system-ui',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif',
]);

/** Foreground tokens reused verbatim from `@booking/ui` globals.css. */
const FG_DARK = 'oklch(0.145 0 0)'; // near-black — on light brand colors
const FG_LIGHT = 'oklch(0.985 0 0)'; // near-white — on dark brand colors

/**
 * Background luminance at which FG_DARK and FG_LIGHT contrast equally, i.e.
 * `sqrt((Y_light + 0.05) * (Y_dark + 0.05)) - 0.05` for the two tokens above
 * (Y 0.955672 and 0.003049). Above it FG_DARK wins, below it FG_LIGHT wins, so
 * every choice lands on the better of the two. Picking any other value hands
 * mid-tone brands the losing foreground — 0.5 gave `#0ea5e9` white text at
 * 2.65:1 (WCAG AA needs 4.5:1).
 */
const FG_BREAK_EVEN = 0.180975;

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_RE = /^(?:rgb|rgba|hsl|hsla|oklch|oklab)\(\s*[0-9a-z.%,/ +-]+\s*\)$/i;
const RGB_RE = /^rgba?\(([^)]*)\)$/i;

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

/** Turn a tenant font-family setting into an injection-safe CSS value. */
function sanitizeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0 || names.length > 5) return null;
  if (names.some((name) => name.length > 80 || !/^[\p{L}\p{N} _-]+$/u.test(name))) return null;

  const family = names.map((name) => (GENERIC_FONTS.has(name) ? name : `'${name}'`));
  if (!names.some((name) => GENERIC_FONTS.has(name))) {
    family.push('ui-sans-serif', 'system-ui', 'sans-serif');
  }
  return family.join(',');
}

/** Expand `#rgb`/`#rgba` shorthand to full form; returns null for non-hex input. */
function expandHex(hex: string): string | null {
  if (!hex.startsWith('#')) return null;
  const body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    return `#${body
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  if (body.length === 6 || body.length === 8) return `#${body.slice(0, 6)}`;
  return null;
}

/** One `rgb()` argument — a 0–255 number or a percentage — clamped to 0–255. */
function rgbChannel(raw: string): number | null {
  const isPercent = raw.endsWith('%');
  const n = Number(isPercent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(255, Math.max(0, isPercent ? (n / 100) * 255 : n));
}

/** Sanitized color → sRGB channels, or null when the notation isn't measurable. */
function toRgb(color: string): [number, number, number] | null {
  const hex = expandHex(color);
  if (hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
  const args = RGB_RE.exec(color);
  if (!args) return null;
  // Both the legacy `rgb(r, g, b)` and modern `rgb(r g b / a)` forms; alpha is dropped.
  const parts = args[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3);
  if (parts.length !== 3) return null;
  const [r, g, b] = parts.map(rgbChannel);
  if (r === null || g === null || b === null) return null;
  return [r, g, b];
}

/** sRGB channel → linear, for WCAG relative luminance. */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Pick the more readable foreground token (near-black / near-white) for a
 * background color. Returns null when the notation carries no measurable
 * luminance (`hsl()`, `oklch()`, …) — callers must not guess a foreground for a
 * color they cannot measure, or a `rgb(255,255,255)` tenant background gets
 * white text.
 */
export function contrastToken(color: string): string | null {
  const rgb = toRgb(color);
  if (!rgb) return null;
  const luminance = 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
  return luminance > FG_BREAK_EVEN ? FG_DARK : FG_LIGHT;
}

/**
 * Resolve one untrusted tenant channel to a color plus its readable foreground.
 * A color we cannot measure is treated as invalid — falling back to the platform
 * default keeps the pair readable instead of shipping an unreadable brand.
 */
function swatch(value: unknown, fallback: string): { color: string; foreground: string } {
  const color = sanitizeColor(value);
  const foreground = color === null ? null : contrastToken(color);
  if (color !== null && foreground !== null) return { color, foreground };
  // DEFAULTS are hex, so contrastToken always measures them.
  return { color: fallback, foreground: contrastToken(fallback) ?? FG_DARK };
}

/**
 * Build the `:root { … }` CSS that overrides the shadcn base tokens per tenant.
 * Each channel is sanitized after the shared contract validates the payload shape.
 */
export function themeCss(theme: ThemeConfigInput): string {
  const primary = swatch(theme.colors?.primary, DEFAULTS.primary);
  const accent = swatch(theme.colors?.accent, DEFAULTS.accent);
  const background = swatch(theme.colors?.background, DEFAULTS.background);
  const font = sanitizeFontFamily(theme.font) ?? DEFAULT_FONT;
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
