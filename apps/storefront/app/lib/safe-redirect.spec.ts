import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it.each(['//evil.example', '/\\evil.example', 'https://evil.example/path', 'javascript:alert(1)'])(
    'rejects external target %s',
    (value) => {
      expect(safeRedirectPath(value, '/')).toBe('/');
    },
  );

  it('preserves a same-origin path, query, and hash', () => {
    expect(safeRedirectPath('/bookings?status=pending#top', '/')).toBe(
      '/bookings?status=pending#top',
    );
  });

  it('uses the fallback for non-string values', () => {
    expect(safeRedirectPath(null, '/fallback')).toBe('/fallback');
  });
});
