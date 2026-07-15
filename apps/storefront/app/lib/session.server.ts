import { randomUUID } from 'node:crypto';
import { createCookie, redirect } from 'react-router';
import { storefrontRedisStore, type RedisJsonStore } from './redis-store.server';

const TTL_SECONDS = 60 * 60 * 24 * 30;
const PREFIX = 'bookify:storefront:session:';

export interface StorefrontSessionData {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

function secrets(): string[] {
  const current = process.env.SESSION_SECRET_CURRENT ?? process.env.SESSION_SECRET;
  if (!current || current.length < 32) {
    throw new Error('SESSION_SECRET_CURRENT must contain at least 32 characters.');
  }
  return [current, process.env.SESSION_SECRET_PREVIOUS].filter((value): value is string =>
    Boolean(value && value.length >= 32),
  );
}

export function createStorefrontSessionService(store: RedisJsonStore = storefrontRedisStore) {
  const cookie = createCookie('__storefront_session', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.SESSION_COOKIE_SECURE
      ? process.env.SESSION_COOKIE_SECURE !== 'false'
      : process.env.NODE_ENV === 'production',
    secrets: secrets(),
    maxAge: TTL_SECONDS,
  });
  return {
    async read(request: Request) {
      const id: unknown = await cookie.parse(request.headers.get('Cookie'));
      if (typeof id !== 'string' || !id) return null;
      const data = await store.get<StorefrontSessionData>(`${PREFIX}${id}`);
      if (!data?.accessToken || !data.refreshToken || !data.userId) return null;
      return { id, data };
    },
    async create(data: StorefrontSessionData) {
      const id = randomUUID();
      await store.set(`${PREFIX}${id}`, data, TTL_SECONDS);
      return cookie.serialize(id);
    },
    async rotate(id: string, data: StorefrontSessionData) {
      await store.set(`${PREFIX}${id}`, data, TTL_SECONDS);
    },
    async destroy(request: Request) {
      const id: unknown = await cookie.parse(request.headers.get('Cookie'));
      if (typeof id === 'string' && id) await store.delete(`${PREFIX}${id}`);
      return cookie.serialize('', { expires: new Date(0), maxAge: 0 });
    },
  };
}

export type StorefrontSessionService = ReturnType<typeof createStorefrontSessionService>;
let singleton: StorefrontSessionService | undefined;
export const getStorefrontSessionService = () => (singleton ??= createStorefrontSessionService());

export async function createUserSession(
  request: Request,
  data: StorefrontSessionData,
  redirectTo: string,
) {
  const service = getStorefrontSessionService();
  await service.destroy(request);
  return redirect(redirectTo, { headers: { 'Set-Cookie': await service.create(data) } });
}

export async function destroyUserSession(request: Request, redirectTo: string) {
  return redirect(redirectTo, {
    headers: { 'Set-Cookie': await getStorefrontSessionService().destroy(request) },
  });
}
