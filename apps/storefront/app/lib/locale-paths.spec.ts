import { describe, expect, it } from 'vitest';
import { localeFromPath, switchLocalePath } from './locale-paths';

describe('locale paths', () => {
  it('reads only supported locale prefixes', () => {
    expect(localeFromPath('/vi/l/hotel')).toBe('vi');
    expect(localeFromPath('/en')).toBe('en');
    expect(localeFromPath('/fr/l/hotel')).toBeNull();
  });

  it('switches the locale while preserving path, search and hash', () => {
    expect(switchLocalePath('/vi/l/hotel?day=2026-08-01#booking', 'en')).toBe(
      '/en/l/hotel?day=2026-08-01#booking',
    );
  });
});
