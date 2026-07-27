import { randomUUID } from 'node:crypto';
import { createCookie, redirect } from 'react-router';
import { storefrontRedisStore, type RedisJsonStore } from './redis-store.server';
import {
  SessionRefreshLockTimeoutError,
  withDistributedRefreshLock,
  type RefreshLockObservation,
} from './refresh-lock.server';
import { storefrontEnv } from './env.server';
import { safeRedirectPath } from './safe-redirect';

const TTL_SECONDS = 60 * 60 * 24 * 30;
const PREFIX = 'bookingos:storefront:session:';

export interface StorefrontSessionData {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export { SessionRefreshLockTimeoutError };
export type { RefreshLockObservation };

export function createStorefrontSessionService(store: RedisJsonStore = storefrontRedisStore) {
  const cookie = createCookie('__storefront_session', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: storefrontEnv.secureCookies,
    secrets: [...storefrontEnv.sessionSecrets],
    maxAge: TTL_SECONDS,
  });

  async function readById(id: string): Promise<StorefrontSessionData | null> {
    const data = await store.get<StorefrontSessionData>(`${PREFIX}${id}`);
    if (!data?.accessToken || !data.refreshToken || !data.userId) return null;
    return data;
  }

  return {
    async read(request: Request) {
      const id: unknown = await cookie.parse(request.headers.get('Cookie'));
      if (typeof id !== 'string' || !id) return null;
      const data = await readById(id);
      return data ? { id, data } : null;
    },
    readById,
    async create(data: StorefrontSessionData) {
      const id = randomUUID();
      await store.set(`${PREFIX}${id}`, data, TTL_SECONDS);
      return cookie.serialize(id);
    },
    async rotate(id: string, data: StorefrontSessionData) {
      await store.set(`${PREFIX}${id}`, data, TTL_SECONDS);
    },
    withRefreshLock<T>(
      id: string,
      callback: () => Promise<T>,
      observeWhileWaiting?: () => Promise<RefreshLockObservation<T>>,
    ): Promise<T> {
      return withDistributedRefreshLock(store, id, callback, observeWhileWaiting);
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
  return redirect(safeRedirectPath(redirectTo), {
    headers: { 'Set-Cookie': await service.create(data) },
  });
}

export async function destroyUserSession(request: Request, redirectTo: string) {
  return redirect(safeRedirectPath(redirectTo), {
    headers: { 'Set-Cookie': await getStorefrontSessionService().destroy(request) },
  });
}
