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

const client = () => createApiClient(storefrontEnv.backendUrl);

type StorefrontJsonOptions<T> = Omit<ApiRequestOptions<T>, 'signal' | 'schema'> & {
  schema: ZodType<T, ZodTypeDef, unknown>;
};

type NullableReadOptions<T> = StorefrontJsonOptions<T> & { allowNotFound: true };

function forwardedHost(request: Request): string {
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
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

function statusForReadFailure(result: ApiResult<unknown>): number {
  if (result.failure === 'timeout') return 504;
  if (result.failure === 'invalid-response') return 502;
  if (result.status >= 500 || result.failure === 'network') return 503;
  return result.status;
}

function readFailure(result: ApiResult<unknown>): Response {
  return new Response('Storefront API request failed', {
    status: statusForReadFailure(result),
  });
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
export async function publicGetData<T>(
  request: Request,
  path: string,
  options: StorefrontJsonOptions<T> & { allowNotFound?: boolean },
): Promise<T | null> {
  const accessToken = getOptionalAccessToken();
  const requestOptionsForCall = requestOptions(request, options);
  const result = accessToken
    ? await client().get(path, accessToken, requestOptionsForCall)
    : await client().publicGet(path, requestOptionsForCall);
  if (result.status === 404 && options.allowNotFound) return null;
  if (!result.ok || result.data === null) throw readFailure(result);
  return result.data;
}

export const publicPost = <T>(
  request: Request,
  path: string,
  body: unknown,
  options: StorefrontJsonOptions<T>,
) => client().publicPost(path, body, requestOptions(request, options));

export const apiGet = <T>(
  request: Request,
  path: string,
  auth: Auth,
  options: StorefrontJsonOptions<T>,
) => client().get(path, auth, requestOptions(request, options));

export const apiPost = <T>(
  request: Request,
  path: string,
  body: unknown,
  auth: Auth,
  options: StorefrontJsonOptions<T>,
) => client().post(path, body, auth, requestOptions(request, options));

function authOptions(request: Request) {
  return {
    signal: request.signal,
    requestId: request.headers.get('x-request-id') ?? undefined,
    headers: { 'x-forwarded-host': forwardedHost(request) },
  };
}

export const backendLogin = (request: Request, credentials: { email: string; password: string }) =>
  client().login(credentials, authOptions(request));
export const backendRegister = (request: Request, credentials: BackendRegisterCredentials) =>
  client().register(credentials, authOptions(request));
export const backendRefresh = (request: Request, refreshToken: string) =>
  client().refresh(refreshToken, authOptions(request));
export const backendLogout = (request: Request, accessToken: string) =>
  client().logout(accessToken, authOptions(request));
