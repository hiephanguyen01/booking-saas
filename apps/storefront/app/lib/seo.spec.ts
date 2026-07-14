import { describe, expect, it } from 'vitest';
import { canonicalUrl, localizedAlternates } from './seo';

describe('storefront SEO URLs', () => {
  it('removes tracking parameters and fragments from canonical URLs', () => {
    expect(
      canonicalUrl(new URL('https://shop.test/vi/l/a?utm_source=x&fbclid=y#booking')),
    ).toBe('https://shop.test/vi/l/a');
  });

  it('builds reciprocal localized alternates', () => {
    expect(localizedAlternates(new URL('https://shop.test/vi/l/a'))).toEqual({
      vi: 'https://shop.test/vi/l/a',
      en: 'https://shop.test/en/l/a',
      default: 'https://shop.test/vi/l/a',
    });
  });
});
