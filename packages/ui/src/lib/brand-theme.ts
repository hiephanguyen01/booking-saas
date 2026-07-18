/** Injection-safe helpers shared by storefront and dashboard tenant branding. */

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

const FG_DARK = 'oklch(0.145 0 0)';
const FG_LIGHT = 'oklch(0.985 0 0)';
const FG_BREAK_EVEN = 0.180975;
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_RE = /^(?:rgb|rgba|hsl|hsla|oklch|oklab)\(\s*[0-9a-z.%,/ +-]+\s*\)$/i;
const RGB_RE = /^rgba?\(([^)]*)\)$/i;

export function sanitizeBrandColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (color.length === 0 || color.length > 64) return null;
  return HEX_RE.test(color) || FUNC_RE.test(color) ? color : null;
}

export function sanitizeBrandFont(value: unknown): string | null {
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

function expandHex(hex: string): string | null {
  if (!hex.startsWith('#')) return null;
  const body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    return `#${body
      .slice(0, 3)
      .split('')
      .map((channel) => channel + channel)
      .join('')}`;
  }
  if (body.length === 6 || body.length === 8) return `#${body.slice(0, 6)}`;
  return null;
}

function rgbChannel(raw: string): number | null {
  const isPercent = raw.endsWith('%');
  const value = Number(isPercent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(255, Math.max(0, isPercent ? (value / 100) * 255 : value));
}

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
  const channels = args?.[1];
  if (!channels) return null;
  const parts = channels
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3);
  if (parts.length !== 3) return null;
  const red = rgbChannel(parts[0] ?? '');
  const green = rgbChannel(parts[1] ?? '');
  const blue = rgbChannel(parts[2] ?? '');
  return red === null || green === null || blue === null ? null : [red, green, blue];
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Pick the higher-contrast near-black/near-white foreground for a measurable color. */
export function brandContrastForeground(color: string): string | null {
  const rgb = toRgb(color);
  if (!rgb) return null;
  const luminance = 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
  return luminance > FG_BREAK_EVEN ? FG_DARK : FG_LIGHT;
}
