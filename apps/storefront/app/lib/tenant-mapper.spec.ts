import type { PublicTenantResponse } from '@booking/contracts';
import { describe, expect, it } from 'vitest';
import { toStorefrontTenant } from './tenant-mapper';

describe('toStorefrontTenant', () => {
  it('reads faviconUrl from the top level of themeConfig', () => {
    const tenant = {
      id: 'tenant-1',
      name: 'Studio One',
      slug: 'studio-one',
      defaultLocale: 'vi',
      vertical: 'studio',
      live: true,
      themeConfig: {
        faviconUrl: 'https://cdn.example/favicon.ico',
      },
    } as PublicTenantResponse;

    expect(toStorefrontTenant(tenant).faviconUrl).toBe(
      'https://cdn.example/favicon.ico',
    );
  });
});
