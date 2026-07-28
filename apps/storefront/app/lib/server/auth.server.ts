import { redirect } from 'react-router';
import { getCurrentStorefrontAuth } from './request-context.server';

export const getOptionalAuth = () => getCurrentStorefrontAuth();
export function requireAuth(redirectTo: string) {
  const auth = getOptionalAuth();
  if (!auth) throw redirect(redirectTo);
  return auth;
}
export const getOptionalAccessToken = () => getOptionalAuth()?.session.accessToken ?? null;
