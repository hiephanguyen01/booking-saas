import { createCookie } from 'react-router';
import { storefrontEnv } from './env.server';

/**
 * Every storefront cookie carries the same security posture: server-only,
 * site-wide, lax, secure in production, and signed with the rotating session
 * secrets. Five features declared that block separately, so a change to the
 * posture had to be made five times or it silently applied to some cookies only.
 */
export function signedCookie(name: string, maxAge: number) {
  return createCookie(name, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: storefrontEnv.secureCookies,
    secrets: [...storefrontEnv.sessionSecrets],
    maxAge,
  });
}
