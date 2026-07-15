import { describe, expect, it } from 'vitest';
import { loadHomeCatalog } from './home-data.server';

const request = new Request('https://storefront.example/vi');

describe('loadHomeCatalog', () => {
  it('uses fixtures for an empty development catalog', async () => {
    const result = await loadHomeCatalog(request, 'development', async () => []);

    expect(result.usesFixtures).toBe(true);
    expect(result.listings.length).toBeGreaterThan(18);
  });

  it('uses fixtures when the development endpoint is unavailable', async () => {
    const result = await loadHomeCatalog(request, 'test', async () => {
      throw new Error('offline');
    });

    expect(result.usesFixtures).toBe(true);
  });

  it('keeps an empty production catalog truthful', async () => {
    const result = await loadHomeCatalog(request, 'production', async () => []);

    expect(result).toEqual({ listings: [], usesFixtures: false });
  });

  it('rethrows a production endpoint failure', async () => {
    await expect(
      loadHomeCatalog(request, 'production', async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
  });
});
