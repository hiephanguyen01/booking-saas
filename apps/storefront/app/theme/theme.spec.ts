import { describe, expect, it } from 'vitest';
import { contrastToken, sanitizeColor, themeCss } from './theme';

const FG_DARK = 'oklch(0.145 0 0)';
const FG_LIGHT = 'oklch(0.985 0 0)';

/** sRGB relative luminance (WCAG 2.x) of a `#rrggbb` string. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Oklab is achromatic here, so linear Y collapses to L³. */
const TOKEN_LUMINANCE: Record<string, number> = { [FG_DARK]: 0.145 ** 3, [FG_LIGHT]: 0.985 ** 3 };

/** WCAG contrast ratio between a hex background and one of the foreground tokens. */
function contrastRatio(hex: string, token: string): number {
  const [hi, lo] = [luminance(hex), TOKEN_LUMINANCE[token]].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

describe('contrastToken', () => {
  it.each([
    // The two seeded tenant brands, plus their accents (TONG-QUAN.md §16.2).
    ['#0EA5E9', FG_DARK],
    ['#7C3AED', FG_LIGHT],
    ['#F97316', FG_DARK],
    ['#F59E0B', FG_DARK],
    ['#FFFFFF', FG_DARK],
    ['#000000', FG_LIGHT],
  ])('picks the foreground for %s that meets WCAG AA', (color, expected) => {
    expect(contrastToken(color)).toBe(expected);
    expect(contrastRatio(color, expected)).toBeGreaterThanOrEqual(4.5);
  });

  it('always picks the higher-contrast of the two foreground tokens', () => {
    for (let value = 0; value <= 0xffffff; value += 0x000101) {
      const hex = `#${value.toString(16).padStart(6, '0')}`;
      const picked = contrastToken(hex);
      expect(picked).not.toBeNull();
      const rejected = picked === FG_DARK ? FG_LIGHT : FG_DARK;
      expect(contrastRatio(hex, picked!)).toBeGreaterThanOrEqual(contrastRatio(hex, rejected));
    }
  });

  it('expands shorthand hex and ignores the alpha channel', () => {
    expect(contrastToken('#fff')).toBe(FG_DARK);
    expect(contrastToken('#000f')).toBe(FG_LIGHT);
  });

  it('measures rgb() notation rather than guessing', () => {
    expect(contrastToken('rgb(255,255,255)')).toBe(FG_DARK);
    expect(contrastToken('rgb(255 255 255 / 50%)')).toBe(FG_DARK);
    expect(contrastToken('rgb(100%,100%,100%)')).toBe(FG_DARK);
    expect(contrastToken('rgb(0,0,0)')).toBe(FG_LIGHT);
  });

  it('reports notations whose luminance it cannot measure', () => {
    expect(contrastToken('hsl(210 90% 55%)')).toBeNull();
    expect(contrastToken('oklch(0.7 0.15 250)')).toBeNull();
    expect(contrastToken('rgb(1,2)')).toBeNull();
  });
});

describe('sanitizeColor', () => {
  it('accepts hex and safe color functions', () => {
    expect(sanitizeColor('#0EA5E9')).toBe('#0EA5E9');
    expect(sanitizeColor('  #fff  ')).toBe('#fff');
    expect(sanitizeColor('rgb(14 165 233 / 80%)')).toBe('rgb(14 165 233 / 80%)');
    expect(sanitizeColor('oklch(0.7 0.15 250)')).toBe('oklch(0.7 0.15 250)');
  });

  it('rejects anything that could break out of the <style> block', () => {
    expect(sanitizeColor('red;}</style><script>alert(1)</script>')).toBeNull();
    expect(sanitizeColor('url(javascript:alert(1))')).toBeNull();
    expect(sanitizeColor('expression(alert(1))')).toBeNull();
    expect(sanitizeColor('#fff}')).toBeNull();
    expect(sanitizeColor(`rgb(0,0,0)"`)).toBeNull();
    expect(sanitizeColor(`#${'a'.repeat(70)}`)).toBeNull();
    expect(sanitizeColor(null)).toBeNull();
    expect(sanitizeColor(42)).toBeNull();
  });
});

describe('themeCss', () => {
  it('maps tenant colors to semantic storefront tokens', () => {
    const css = themeCss({ primary: '#123456', accent: '#abcdef', background: '#f8fafc' });

    expect(css).toContain('--primary:#123456');
    expect(css).toContain(`--primary-foreground:${FG_LIGHT}`);
    expect(css).toContain('--ring:#123456');
    expect(css).toContain('--background:#f8fafc');
    expect(css).toContain(`--foreground:${FG_DARK}`);
    expect(css).toContain('--sf-accent:#abcdef');
    expect(css).toContain('--sf-primary-soft:color-mix(in oklch,#123456 10%,#f8fafc)');
    expect(css).toContain('--sf-accent-soft:color-mix(in oklch,#abcdef 10%,#f8fafc)');
  });

  it('leaves --accent to shadcn: it is the neutral hover surface, not a brand token', () => {
    const css = themeCss({ primary: '#123456', accent: '#abcdef', background: '#ffffff' });

    expect(css).not.toContain('--accent:');
    expect(css).not.toContain('--accent-foreground:');
  });

  it('falls back to the platform default for an unsafe color', () => {
    const css = themeCss({ primary: '</style><script>', accent: '', background: 'red;}' });

    expect(css).toContain('--primary:#0ea5e9');
    expect(css).toContain('--sf-accent:#f97316');
    expect(css).toContain('--background:#ffffff');
    expect(css).toContain(`--foreground:${FG_DARK}`);
  });

  it('falls back rather than shipping a brand whose foreground it cannot pick', () => {
    const css = themeCss({ primary: 'oklch(0.7 0.15 250)', accent: '#f97316', background: '#fff' });

    expect(css).toContain('--primary:#0ea5e9');
    expect(css).toContain(`--primary-foreground:${FG_DARK}`);
  });
});
