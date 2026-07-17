export { createApiClient } from './client';
export type { ApiClient } from './client';
export type {
  ApiClientOptions,
  ApiFailure,
  ApiRequestOptions,
  ApiResult,
  ApiAuth,
  Auth,
  AuthRequestOptions,
  RefreshedTokens,
  BackendAuthResult,
  BackendLoginResult,
  BackendRegisterCredentials,
  BackendRegisterResult,
  BackendRefreshResult,
} from './types';
export { toResult, networkError, transportError } from './errors';
export { parseSetCookies, normalizeAuth, scopeHeaders } from './interceptor';
