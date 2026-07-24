import {
  createApiClient,
  type ApiRequestOptions,
  type ApiResult,
  type Auth,
  type BackendRegisterCredentials,
} from '@booking/api-client';
import type { ZodType, ZodTypeDef } from 'zod';
import { getOptionalAccessToken } from './auth.server';
import { storefrontEnv } from './env.server';

const apiClient = createApiClient(storefrontEnv.backendUrl);
const requestReads = new WeakMap<Request, Map<string, Promise<unknown>>>();
const SAFE_ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const SAFE_FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const INVALID_HOST_DELIMITER_RE = /[\\/?#@]/;
const MAX_FORWARDED_HOST_LENGTH = 255;
const MAX_FIELD_ERROR_KEYS = 50;
const MAX_FIELD_MESSAGES = 5;

type StorefrontJsonOptions<T> = Omit<ApiRequestOptions<T>, 'signal' | 'schema'> & {
  schema: ZodType<T, ZodTypeDef, unknown>;
};

type NullableReadOptions<T> = StorefrontJsonOptions<T> & { allowNotFound: true };

function invalidForwardedHost(): never {
  throw new Response('Invalid storefront host', { status: 400 });
}

function hasInvalidHostCharacters(value: string): boolean {
  if (INVALID_HOST_DELIMITER_RE.test(value)) return true;
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

function forwardedHost(request: Request): string {
  // Keep the port: checkout callbacks must return to the exact storefront host
  // the customer used (for example localhost:5173). The API still owns the
  // Host→tenant authorization decision; the BFF only rejects ambiguous or
  // malformed values before forwarding them.
  const raw = request.headers.get('host')?.split(',')[0]?.trim() || new URL(request.url).host;
  if (!raw || raw.length > MAX_FORWARDED_HOST_LENGTH || hasInvalidHostCharacters(raw)) {
    invalidForwardedHost();
  }

  let parsed: URL;
  try {
    parsed = new URL(`http://${raw}`);
  } catch {
    invalidForwardedHost();
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    !parsed.hostname
  ) {
    invalidForwardedHost();
  }

  const normalized = parsed.host.toLowerCase();
  if (!normalized || normalized.length > MAX_FORWARDED_HOST_LENGTH) invalidForwardedHost();
  return normalized;
}

function requestOptions<T>(
  request: Request,
  options: StorefrontJsonOptions<T>,
): ApiRequestOptions<T> {
  return {
    ...options,
    signal: request.signal,
    requestId: options.requestId ?? request.headers.get('x-request-id') ?? undefined,
    headers: {
      ...options.headers,
      'x-forwarded-host': forwardedHost(request),
    },
  };
}

export function apiFailureStatus(result: ApiResult<unknown>): number {
  if (result.failure === 'timeout') return 504;
  if (result.failure === 'invalid-response') return 502;
  if (result.status >= 500 || result.failure === 'network') return 503;
  return result.status || 500;
}

export function rethrowApiInfrastructureFailure(result: ApiResult<unknown>): void {
  if (result.ok) return;
  const status = apiFailureStatus(result);
  if (status >= 500) {
    throw new Response('Storefront API request failed', { status });
  }
}

function readFailure(result: ApiResult<unknown>): Response {
  return new Response('Storefront API request failed', {
    status: apiFailureStatus(result),
  });
}

function safeErrorCode(value: string | undefined): string | undefined {
  const code = value?.trim();
  return code && SAFE_ERROR_CODE_RE.test(code) ? code : undefined;
}

function safeFieldErrors(
  value: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
  if (!value) return undefined;

  const entries = Object.entries(value)
    .slice(0, MAX_FIELD_ERROR_KEYS)
    .flatMap(([field, messages]) => {
      if (!SAFE_FIELD_NAME_RE.test(field) || !Array.isArray(messages)) return [];
      const safeMessages = [
        ...new Set(
          messages
            .slice(0, MAX_FIELD_MESSAGES)
            .map((message) => safeErrorCode(message) ?? 'INVALID_VALUE'),
        ),
      ];
      return safeMessages.length ? [[field, safeMessages] as const] : [];
    });

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function safeFailureMessage(request: Request, result: ApiResult<unknown>): string {
  const english = /^\/en(?:\/|$)/.test(new URL(request.url).pathname);
  if (result.failure === 'timeout') {
    return english
      ? 'The request timed out. Please try again.'
      : 'Yêu cầu đã hết thời gian chờ. Vui lòng thử lại.';
  }
  if (result.failure === 'network') {
    return english
      ? 'The service is temporarily unavailable. Please try again.'
      : 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại.';
  }
  if (result.failure === 'invalid-response') {
    return english
      ? 'The service returned an invalid response. Please try again.'
      : 'Dịch vụ trả về phản hồi không hợp lệ. Vui lòng thử lại.';
  }
  return english
    ? 'Unable to complete the request. Please try again.'
    : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}

/**
 * API responses may contain implementation messages that are useful in backend
 * logs but must never enter Storefront loader/action hydration payloads.
 * Preserve only stable problem codes, bounded field-error codes, status and
 * request IDs; replace every free-form message with a localized generic error.
 */
function sanitizeApiResult<T>(request: Request, result: ApiResult<T>): ApiResult<T> {
  if (result.ok) return result;

  const fieldErrors = safeFieldErrors(result.fieldErrors ?? result.errors);
  return {
    ...result,
    error: safeFailureMessage(request, result),
    code: safeErrorCode(result.code),
    errors: fieldErrors,
    fieldErrors,
  };
}

function memoizedRead<T>(request: Request, key: string, read: () => Promise<T>): Promise<T> {
  let reads = requestReads.get(request);
  if (!reads) {
    reads = new Map();
    requestReads.set(request, reads);
  }
  const existing = reads.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = read();
  reads.set(key, pending);
  pending.catch(() => reads?.delete(key));
  return pending;
}

function queryKey(query: ApiRequestOptions<unknown>['query']): string {
  if (!query) return '';
  return JSON.stringify(
    Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value]),
  );
}

export function publicGetData<T>(
  request: Request,
  path: string,
  options: NullableReadOptions<T>,
): Promise<T | null>;
export function publicGetData<T>(
  request: Request,
  path: string,
  options: StorefrontJsonOptions<T>,
): Promise<T>;
export function publicGetData<T>(
  request: Request,
  path: string,
  options: StorefrontJsonOptions<T> & { allowNotFound?: boolean },
): Promise<T | null> {
  const accessToken = getOptionalAccessToken();
  const key = `public-get:${accessToken ? 'authenticated' : 'anonymous'}:${path}:${queryKey(options.query)}:${Boolean(options.allowNotFound)}`;
  return memoizedRead(request, key, async () => {
    const requestOptionsForCall = requestOptions(request, options);
    const result = accessToken
      ? await apiClient.get(path, accessToken, requestOptionsForCall)
      : await apiClient.publicGet(path, requestOptionsForCall);
    if (result.status === 404 && options.allowNotFound) return null;
    if (!result.ok || result.data === null) throw readFailure(result);
    return result.data;
  });
}

export async function publicPost<T>(
  request: Request,
  path: string,
  body: unknown,
  options: StorefrontJsonOptions<T>,
): Promise<ApiResult<T>> {
  const result = await apiClient.publicPost(path, body, requestOptions(request, options));
  return sanitizeApiResult(request, result);
}

export async function optionalAuthPost<T>(
  request: Request,
  path: string,
  body: unknown,
  options: StorefrontJsonOptions<T>,
): Promise<ApiResult<T>> {
  const accessToken = getOptionalAccessToken();
  const requestOptionsForCall = requestOptions(request, options);
  const result = accessToken
    ? await apiClient.post(path, body, accessToken, requestOptionsForCall)
    : await apiClient.publicPost(path, body, requestOptionsForCall);
  return sanitizeApiResult(request, result);
}

export function apiGet<T>(
  request: Request,
  path: string,
  auth: Auth,
  options: StorefrontJsonOptions<T>,
): Promise<ApiResult<T>> {
  const key = `api-get:${path}:${queryKey(options.query)}`;
  return memoizedRead(request, key, async () => {
    const result = await apiClient.get(path, auth, requestOptions(request, options));
    return sanitizeApiResult(request, result);
  });
}

export async function apiPost<T>(
  request: Request,
  path: string,
  body: unknown,
  auth: Auth,
  options: StorefrontJsonOptions<T>,
): Promise<ApiResult<T>> {
  const result = await apiClient.post(path, body, auth, requestOptions(request, options));
  return sanitizeApiResult(request, result);
}

function authOptions(request: Request) {
  return {
    signal: request.signal,
    requestId: request.headers.get('x-request-id') ?? undefined,
    headers: { 'x-forwarded-host': forwardedHost(request) },
  };
}

export const backendLogin = (request: Request, credentials: { email: string; password: string }) =>
  apiClient.login(credentials, authOptions(request));
export const backendRegister = (request: Request, credentials: BackendRegisterCredentials) =>
  apiClient.register(credentials, authOptions(request));
export const backendRefresh = (request: Request, refreshToken: string) =>
  apiClient.refresh(refreshToken, authOptions(request));
export const backendLogout = (request: Request, accessToken: string) =>
  apiClient.logout(accessToken, authOptions(request));
