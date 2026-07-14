import { describe, expect, it, vi } from 'vitest';
import { requestPublicJson } from './public-api.server';

const request = new Request('https://storefront.example/vi', {
  headers: { host: 'storefront.example' },
});

describe('requestPublicJson', () => {
  it('returns successful JSON data', async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({ items: [] }, { status: 200 }),
    ) as typeof fetch;

    await expect(
      requestPublicJson<{ items: unknown[] }>(request, '/public/items', {
        fetchImplementation,
      }),
    ).resolves.toEqual({ items: [] });
  });

  it('returns null only for an explicitly allowed 404', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response('missing', { status: 404 }),
    ) as typeof fetch;

    await expect(
      requestPublicJson(request, '/public/items/missing', {
        allowNotFound: true,
        fetchImplementation,
      }),
    ).resolves.toBeNull();
  });

  it('maps an upstream 500 to a 503 route response', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response('failed', { status: 500 }),
    ) as typeof fetch;

    await expect(
      requestPublicJson(request, '/public/items', { fetchImplementation }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('maps malformed successful JSON to 502', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response('{', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    await expect(
      requestPublicJson(request, '/public/items', { fetchImplementation }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('maps network errors to 503', async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new TypeError('connection refused');
    }) as typeof fetch;

    await expect(
      requestPublicJson(request, '/public/items', { fetchImplementation }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
