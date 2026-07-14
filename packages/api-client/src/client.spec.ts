import {
  AxiosError,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApiClient } from './client';

function response(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
  headers: Record<string, string | string[]> = {},
): AxiosResponse {
  return {
    config,
    status,
    statusText: String(status),
    data,
    headers,
  };
}

describe('Axios API client', () => {
  it('forwards isolated auth, scope, query, signal, timeout, and request id options', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    const adapter: AxiosAdapter = async (config) => {
      seen.push(config);
      return response(config, 200, { id: 'item-1' });
    };
    const controller = new AbortController();
    const client = createApiClient({
      baseURL: 'http://api.test',
      timeoutMs: 10_000,
      adapter,
    });

    const result = await client.get(
      '/items',
      { token: 'access-token', tenantId: 'tenant-1', partnerId: 'partner-1' },
      {
        query: { page: 2, status: ['pending', 'confirmed'] },
        signal: controller.signal,
        timeoutMs: 321,
        requestId: 'request-1',
        schema: z.object({ id: z.string() }),
      },
    );

    expect(result).toMatchObject({ ok: true, status: 200, data: { id: 'item-1' } });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.baseURL).toBe('http://api.test');
    expect(seen[0]?.timeout).toBe(321);
    expect(seen[0]?.signal).toBe(controller.signal);
    expect(seen[0]?.params).toEqual({ page: 2, status: ['pending', 'confirmed'] });
    expect(seen[0]?.headers.get('cookie')).toBe('sid=access-token');
    expect(seen[0]?.headers.get('x-tenant-id')).toBe('tenant-1');
    expect(seen[0]?.headers.get('x-partner-id')).toBe('partner-1');
    expect(seen[0]?.headers.get('x-request-id')).toBe('request-1');
  });

  it('does not auto-refresh or retry an ordinary 401 request', async () => {
    const adapter = vi.fn<AxiosAdapter>(async (config) =>
      response(config, 401, { message: 'Expired', code: 'SESSION_EXPIRED' }),
    );
    const client = createApiClient({ baseURL: 'http://api.test', adapter });

    const result = await client.get('/private', {
      token: 'expired-access-token',
      // Deliberately supplied by legacy code: transport must ignore it.
      refreshToken: 'refresh-token',
    } as never);

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: false,
      status: 401,
      failure: 'http',
      code: 'SESSION_EXPIRED',
    });
  });

  it('distinguishes empty success and invalid successful payloads', async () => {
    const emptyClient = createApiClient({
      baseURL: 'http://api.test',
      adapter: async (config) => response(config, 204, ''),
    });
    await expect(emptyClient.delete('/items/1', 'access')).resolves.toEqual({
      ok: true,
      status: 204,
      data: null,
    });

    const invalidClient = createApiClient({
      baseURL: 'http://api.test',
      adapter: async (config) => response(config, 200, { id: 123 }),
    });
    const invalid = await invalidClient.get('/items/1', 'access', {
      schema: z.object({ id: z.string() }),
    });
    expect(invalid).toMatchObject({
      ok: false,
      status: 502,
      failure: 'invalid-response',
      data: null,
    });
  });

  it('distinguishes timeout and network failures while propagating cancellation', async () => {
    const timeoutClient = createApiClient({
      baseURL: 'http://api.test',
      adapter: async (config) => {
        throw new AxiosError('timeout', 'ECONNABORTED', config);
      },
    });
    await expect(timeoutClient.get('/slow', 'access')).resolves.toMatchObject({
      ok: false,
      status: 504,
      failure: 'timeout',
    });

    const networkClient = createApiClient({
      baseURL: 'http://api.test',
      adapter: async (config) => {
        throw new AxiosError('network', AxiosError.ERR_NETWORK, config);
      },
    });
    await expect(networkClient.get('/down', 'access')).resolves.toMatchObject({
      ok: false,
      status: 503,
      failure: 'network',
    });

    const cancelledClient = createApiClient({
      baseURL: 'http://api.test',
      adapter: async () => {
        throw new CanceledError('navigation aborted');
      },
    });
    await expect(cancelledClient.get('/cancelled', 'access')).rejects.toBeInstanceOf(CanceledError);
  });

  it('refreshes only through the explicit auth method', async () => {
    const controller = new AbortController();
    const adapter: AxiosAdapter = async (config) => {
      expect(config.url).toBe('/auth/refresh');
      expect(config.headers.get('cookie')).toBe('rid=refresh-token');
      expect(config.signal).toBe(controller.signal);
      return response(config, 200, {}, { 'set-cookie': ['sid=new-access; Path=/', 'rid=new-refresh; Path=/'] });
    };
    const client = createApiClient({ baseURL: 'http://api.test', adapter });

    await expect(client.refresh('refresh-token', { signal: controller.signal })).resolves.toEqual({
      ok: true,
      status: 200,
      tokens: { accessToken: 'new-access', refreshToken: 'new-refresh' },
    });
  });
});
