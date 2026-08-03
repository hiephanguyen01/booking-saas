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
const HSL_RE = /^hsla?\(([^)]*)\)$/i;
const OKLCH_RE = /^oklch\(([^)]*)\)$/i;
const OKLAB_RE = /^oklab\(([^)]*)\)$/i;

export function sanitizeBrandColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (color.length === 0 || color.length > 64) return null;
  if (!HEX_RE.test(color) && !FUNC_RE.test(color)) return null;
  return toRgb(color) ? color : null;
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

function splitColorArgs(raw: string): string[] {
  return raw
    .split('/')[0]!
    .split(/[\s,]+/)
    .filter(Boolean);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rgbChannel(raw: string): number | null {
  const isPercent = raw.endsWith('%');
  const value = Number(isPercent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(value)) return null;
  return clamp(isPercent ? (value / 100) * 255 : value, 0, 255);
}

function unitInterval(raw: string): number | null {
  const percent = raw.endsWith('%');
  const value = Number(percent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(value)) return null;
  return clamp(percent ? value / 100 : value, 0, 1);
}

function signedOklabAxis(raw: string): number | null {
  const percent = raw.endsWith('%');
  const value = Number(percent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(value)) return null;
  return clamp(percent ? (value / 100) * 0.4 : value, -0.4, 0.4);
}

function oklchChroma(raw: string): number | null {
  const percent = raw.endsWith('%');
  const value = Number(percent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(value)) return null;
  return clamp(percent ? (value / 100) * 0.4 : value, 0, 0.4);
}

function hueDegrees(raw: string): number | null {
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(deg|grad|rad|turn)?$/i.exec(raw);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2]?.toLowerCase();
  const degrees =
    unit === 'turn'
      ? value * 360
      : unit === 'rad'
        ? (value * 180) / Math.PI
        : unit === 'grad'
          ? value * 0.9
          : value;
  return ((degrees % 360) + 360) % 360;
}

function hslToRgb(raw: string): [number, number, number] | null {
  const parts = splitColorArgs(raw).slice(0, 3);
  if (parts.length !== 3) return null;
  const hue = hueDegrees(parts[0] ?? '');
  const saturationRaw = parts[1] ?? '';
  const lightnessRaw = parts[2] ?? '';
  if (!saturationRaw.endsWith('%') || !lightnessRaw.endsWith('%')) return null;
  const saturation = unitInterval(saturationRaw);
  const lightness = unitInterval(lightnessRaw);
  if (hue === null || saturation === null || lightness === null) return null;

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  return [(red + offset) * 255, (green + offset) * 255, (blue + offset) * 255];
}

function linearToSrgb(channel: number): number {
  const clamped = clamp(channel, 0, 1);
  const encoded =
    clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return encoded * 255;
}

function oklabToRgb(lightness: number, axisA: number, axisB: number): [number, number, number] {
  const lRoot = lightness + 0.3963377774 * axisA + 0.2158037573 * axisB;
  const mRoot = lightness - 0.1055613458 * axisA - 0.0638541728 * axisB;
  const sRoot = lightness - 0.0894841775 * axisA - 1.291485548 * axisB;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function functionalOklabToRgb(raw: string, cylindrical: boolean): [number, number, number] | null {
  const parts = splitColorArgs(raw).slice(0, 3);
  if (parts.length !== 3) return null;
  const lightness = unitInterval(parts[0] ?? '');
  if (lightness === null) return null;

  if (cylindrical) {
    const chroma = oklchChroma(parts[1] ?? '');
    const hue = hueDegrees(parts[2] ?? '');
    if (chroma === null || hue === null) return null;
    const radians = (hue * Math.PI) / 180;
    return oklabToRgb(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians));
  }

  const axisA = signedOklabAxis(parts[1] ?? '');
  const axisB = signedOklabAxis(parts[2] ?? '');
  return axisA === null || axisB === null ? null : oklabToRgb(lightness, axisA, axisB);
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

  const rgb = RGB_RE.exec(color)?.[1];
  if (rgb) {
    const parts = splitColorArgs(rgb).slice(0, 3);
    if (parts.length !== 3) return null;
    const red = rgbChannel(parts[0] ?? '');
    const green = rgbChannel(parts[1] ?? '');
    const blue = rgbChannel(parts[2] ?? '');
    return red === null || green === null || blue === null ? null : [red, green, blue];
  }

  const hsl = HSL_RE.exec(color)?.[1];
  if (hsl) return hslToRgb(hsl);
  const oklch = OKLCH_RE.exec(color)?.[1];
  if (oklch) return functionalOklabToRgb(oklch, true);
  const oklab = OKLAB_RE.exec(color)?.[1];
  return oklab ? functionalOklabToRgb(oklab, false) : null;
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

/** Platform brand colors, used when a tenant channel is absent or unmeasurable. */
export const BRAND_DEFAULTS = {
  primary: '#0ea5e9',
  accent: '#f97316',
  background: '#ffffff',
} as const;

export interface BrandSwatch {
  color: string;
  foreground: string;
}

/**
 * Resolve one untrusted tenant color channel to a color plus its readable
 * foreground. A color we cannot measure is treated as invalid — falling back to
 * the platform default keeps the pair readable instead of shipping an
 * unreadable brand. Both frontends resolve through this, so the same bad input
 * behaves the same way in the storefront and the dashboard.
 */
export function brandSwatch(value: unknown, fallback: string): BrandSwatch {
  const color = sanitizeBrandColor(value);
  const foreground = color === null ? null : brandContrastForeground(color);
  if (color !== null && foreground !== null) return { color, foreground };
  // BRAND_DEFAULTS are hex, so the fallback always measures.
  return { color: fallback, foreground: brandContrastForeground(fallback) ?? FG_DARK };
}
