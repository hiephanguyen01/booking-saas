import {
  createApiClient,
  type ApiResult,
  type Auth,
  type BackendRegisterCredentials,
} from '@booking/api-client';
import { getOptionalAccessToken } from './auth.server';
import { storefrontEnv } from './env.server';
import { authReadKey, memoizedRead, queryKey } from './api-read-cache.server';
import {
  storefrontAuthOptions,
  storefrontRequestOptions,
  type NullableReadOptions,
  type StorefrontJsonOptions,
} from './api-request.server';
import { readFailure, sanitizeApiResult } from './api-result.server';

export { apiFailureStatus, rethrowApiInfrastructureFailure } from './api-result.server';

const apiClient = createApiClient(storefrontEnv.backendUrl);

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
  const key = `public-get:${authReadKey(accessToken)}:${path}:${queryKey(options.query)}:${Boolean(options.allowNotFound)}`;
  return memoizedRead(request, key, async () => {
    const requestOptionsForCall = storefrontRequestOptions(request, options);
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
  const result = await apiClient.publicPost(path, body, storefrontRequestOptions(request, options));
  return sanitizeApiResult(request, result);
}

export async function optionalAuthPost<T>(
  request: Request,
  path: string,
  body: unknown,
  options: StorefrontJsonOptions<T>,
): Promise<ApiResult<T>> {
  const accessToken = getOptionalAccessToken();
  const requestOptionsForCall = storefrontRequestOptions(request, options);
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
  const key = `api-get:${authReadKey(auth)}:${path}:${queryKey(options.query)}`;
  return memoizedRead(request, key, async () => {
    const result = await apiClient.get(path, auth, storefrontRequestOptions(request, options));
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
  const result = await apiClient.post(path, body, auth, storefrontRequestOptions(request, options));
  return sanitizeApiResult(request, result);
}

export async function apiPatch<T>(
  request: Request,
  path: string,
  body: unknown,
  auth: Auth,
  options: StorefrontJsonOptions<T>,
): Promise<ApiResult<T>> {
  const result = await apiClient.patch(
    path,
    body,
    auth,
    storefrontRequestOptions(request, options),
  );
  return sanitizeApiResult(request, result);
}

export const backendLogin = (request: Request, credentials: { email: string; password: string }) =>
  apiClient.login(credentials, storefrontAuthOptions(request));
export const backendRegister = (request: Request, credentials: BackendRegisterCredentials) =>
  apiClient.register(credentials, storefrontAuthOptions(request));
export const backendRefresh = (request: Request, refreshToken: string) =>
  apiClient.refresh(refreshToken, storefrontAuthOptions(request));
export const backendLogout = (request: Request, accessToken: string) =>
  apiClient.logout(accessToken, storefrontAuthOptions(request));
