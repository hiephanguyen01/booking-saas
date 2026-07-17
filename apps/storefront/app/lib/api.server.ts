import { createApiClient, type ApiRequestOptions, type Auth } from '@booking/api-client';
import { storefrontEnv } from './env.server';

const client = () => createApiClient(storefrontEnv.backendUrl);

export const apiGet = <T>(path: string, auth: Auth, options?: ApiRequestOptions<T>) =>
  client().get<T>(path, auth, options);
export const apiPost = <T>(
  path: string,
  body: unknown,
  auth: Auth,
  options?: ApiRequestOptions<T>,
) => client().post<T>(path, body, auth, options);
export const publicPost = <T>(path: string, body: unknown, options?: ApiRequestOptions<T>) =>
  client().publicPost<T>(path, body, options);
export const backendLogin = (credentials: { email: string; password: string }) =>
  client().login(credentials);
export const backendRefresh = (refreshToken: string, signal?: AbortSignal) =>
  client().refresh(refreshToken, { signal });
export const backendLogout = (accessToken: string) => client().logout(accessToken);
