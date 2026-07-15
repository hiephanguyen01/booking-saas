import { describe, expect, it } from 'vitest';
import { themeCss } from './theme';

describe('themeCss', () => {
  it('maps tenant colors to semantic storefront tokens', () => {
    const css = themeCss({
      primary: '#123456',
      accent: '#abcdef',
      background: '#f8fafc',
    });

    expect(css).toContain('--primary:#123456');
    expect(css).toContain('--accent:#abcdef');
    expect(css).toContain('--background:#f8fafc');
    expect(css).toContain('--foreground:oklch(0.145 0 0)');
    expect(css).toContain('--sf-primary-soft:color-mix(in oklch,#123456 10%,#f8fafc)');
    expect(css).toContain('--sf-accent-soft:color-mix(in oklch,#abcdef 10%,#f8fafc)');
  });
});
