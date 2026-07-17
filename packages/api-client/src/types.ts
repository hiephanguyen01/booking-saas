import type { AxiosAdapter } from 'axios';
import type { ZodType, ZodTypeDef } from 'zod';

export type ApiFailure = 'http' | 'network' | 'timeout' | 'invalid-response';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  failure?: ApiFailure;
  error?: string;
  errors?: Record<string, string[]>;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
}

export interface ApiAuth {
  /** Backend access token (the `sid` cookie value). */
  token: string;
  tenantId?: string;
  partnerId?: string;
  affiliateTenantId?: string;
}

export type Auth = string | ApiAuth;

export type QueryValue = string | number | boolean | null | undefined | readonly QueryValue[];

export interface ApiRequestOptions<T> {
  signal?: AbortSignal;
  timeoutMs?: number;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  requestId?: string;
  schema?: ZodType<T, ZodTypeDef, unknown>;
}

export interface ApiClientOptions {
  baseURL: string;
  timeoutMs?: number;
  /** Test/custom-runtime adapter; ordinary consumers should omit this. */
  adapter?: AxiosAdapter;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface BackendRegisterCredentials {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  locale?: 'vi' | 'en';
}

export type AuthRequestOptions = Pick<
  ApiRequestOptions<never>,
  'signal' | 'timeoutMs' | 'headers' | 'requestId'
>;

export interface BackendAuthResult {
  ok: boolean;
  status: number;
  tokens?: RefreshedTokens;
  user?: { id: string };
  code?: string;
  failure?: ApiFailure;
}

export type BackendLoginResult = BackendAuthResult;
export type BackendRegisterResult = BackendAuthResult;

export interface BackendRefreshResult {
  ok: boolean;
  status: number;
  tokens?: RefreshedTokens;
  failure?: ApiFailure;
}
