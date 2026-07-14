import axios, { type AxiosInstance, type Method } from 'axios';
import type { SessionInfoResponse } from '@booking/contracts';
import { toResult, transportError } from './errors';
import { normalizeAuth, parseSetCookies, scopeHeaders } from './interceptor';
import type {
  ApiClientOptions,
  ApiRequestOptions,
  ApiResult,
  Auth,
  BackendLoginResult,
  BackendRefreshResult,
} from './types';

export interface ApiClient {
  get<T>(path: string, auth: Auth, options?: ApiRequestOptions<T>): Promise<ApiResult<T>>;
  post<T>(
    path: string,
    body: unknown,
    auth: Auth,
    options?: ApiRequestOptions<T>,
  ): Promise<ApiResult<T>>;
  patch<T>(
    path: string,
    body: unknown,
    auth: Auth,
    options?: ApiRequestOptions<T>,
  ): Promise<ApiResult<T>>;
  put<T>(
    path: string,
    body: unknown,
    auth: Auth,
    options?: ApiRequestOptions<T>,
  ): Promise<ApiResult<T>>;
  delete<T>(path: string, auth: Auth, options?: ApiRequestOptions<T>): Promise<ApiResult<T>>;
  login(credentials: { email: string; password: string }): Promise<BackendLoginResult>;
  refresh(
    refreshToken: string,
    options?: Pick<ApiRequestOptions<never>, 'signal' | 'timeoutMs' | 'requestId'>,
  ): Promise<BackendRefreshResult>;
  sessionInfo(accessToken: string): Promise<SessionInfoResponse | null>;
  logout(accessToken: string): Promise<void>;
}

function factoryOptions(input: string | ApiClientOptions): ApiClientOptions {
  return typeof input === 'string' ? { baseURL: input } : input;
}

function createAxiosInstance(options: ApiClientOptions): AxiosInstance {
  return axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 10_000,
    adapter: options.adapter,
    validateStatus: () => true,
    headers: { accept: 'application/json' },
  });
}

function authHeaders(auth: Auth, options?: ApiRequestOptions<unknown>): Record<string, string> {
  const normalized = normalizeAuth(auth);
  return {
    cookie: `sid=${normalized.token}`,
    ...scopeHeaders(normalized),
    ...options?.headers,
    ...(options?.requestId ? { 'x-request-id': options.requestId } : {}),
  };
}

async function request<T>(
  instance: AxiosInstance,
  method: Method,
  path: string,
  auth: Auth,
  body: unknown,
  options?: ApiRequestOptions<T>,
): Promise<ApiResult<T>> {
  try {
    const response = await instance.request({
      method,
      url: path,
      data: body,
      params: options?.query,
      signal: options?.signal,
      timeout: options?.timeoutMs,
      headers: authHeaders(auth, options),
    });
    return toResult<T>(response, options?.schema);
  } catch (error) {
    return transportError<T>(error);
  }
}

export function createApiClient(input: string | ApiClientOptions): ApiClient {
  const instance = createAxiosInstance(factoryOptions(input));

  return {
    get: (path, auth, options) => request(instance, 'GET', path, auth, undefined, options),
    post: (path, body, auth, options) => request(instance, 'POST', path, auth, body, options),
    patch: (path, body, auth, options) => request(instance, 'PATCH', path, auth, body, options),
    put: (path, body, auth, options) => request(instance, 'PUT', path, auth, body, options),
    delete: (path, auth, options) => request(instance, 'DELETE', path, auth, undefined, options),

    async login(credentials) {
      try {
        const response = await instance.post('/auth/login', credentials);
        if (response.status < 200 || response.status >= 300) {
          const body =
            response.data && typeof response.data === 'object'
              ? (response.data as { code?: string })
              : {};
          return { ok: false, status: response.status, code: body.code, failure: 'http' };
        }
        const cookies = parseSetCookies(response);
        const body = response.data as { user?: { id: string } } | null;
        if (!cookies.sid || !cookies.rid || !body?.user) {
          return { ok: false, status: 502, failure: 'invalid-response' };
        }
        return {
          ok: true,
          status: response.status,
          tokens: { accessToken: cookies.sid, refreshToken: cookies.rid },
          user: body.user,
        };
      } catch (error) {
        const result = transportError<never>(error);
        return { ok: false, status: result.status, failure: result.failure };
      }
    },

    async refresh(refreshToken, options) {
      try {
        const response = await instance.post(
          '/auth/refresh',
          undefined,
          {
            signal: options?.signal,
            timeout: options?.timeoutMs,
            headers: {
              cookie: `rid=${refreshToken}`,
              ...(options?.requestId ? { 'x-request-id': options.requestId } : {}),
            },
          },
        );
        if (response.status < 200 || response.status >= 300) {
          return { ok: false, status: response.status, failure: 'http' };
        }
        const cookies = parseSetCookies(response);
        if (!cookies.sid || !cookies.rid) {
          return { ok: false, status: 502, failure: 'invalid-response' };
        }
        return {
          ok: true,
          status: response.status,
          tokens: { accessToken: cookies.sid, refreshToken: cookies.rid },
        };
      } catch (error) {
        const result = transportError<never>(error);
        return { ok: false, status: result.status, failure: result.failure };
      }
    },

    async sessionInfo(accessToken) {
      const result = await request<SessionInfoResponse>(
        instance,
        'GET',
        '/auth/session',
        accessToken,
        undefined,
      );
      return result.ok ? result.data : null;
    },

    async logout(accessToken) {
      await request(instance, 'POST', '/auth/logout', accessToken, undefined);
    },
  };
}
