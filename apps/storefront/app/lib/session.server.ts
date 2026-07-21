import { randomUUID } from 'node:crypto';
import { createCookie, redirect } from 'react-router';
import { storefrontRedisStore, type RedisJsonStore } from './redis-store.server';
import { storefrontEnv } from './env.server';
import { safeRedirectPath } from './safe-redirect';

const TTL_SECONDS = 60 * 60 * 24 * 30;
const PREFIX = 'bookify:storefront:session:';
const REFRESH_LOCK_PREFIX = 'bookify:storefront:session-refresh-lock:';
// A contended path can validate a newly-rotated token, refresh it if needed,
// and validate once more. Keep the lock above the API client's 3 × 10s budget.
const REFRESH_LOCK_TTL_MS = 35_000;
const REFRESH_LOCK_WAIT_MS = 2_500;
const REFRESH_LOCK_RETRY_MS = 50;

export interface StorefrontSessionData {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export class SessionRefreshLockTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for the storefront session refresh lock');
    this.name = 'SessionRefreshLockTimeoutError';
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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
    async withRefreshLock<T>(id: string, callback: () => Promise<T>): Promise<T> {
      const key = `${REFRESH_LOCK_PREFIX}${id}`;
      const value = randomUUID();
      const deadline = Date.now() + REFRESH_LOCK_WAIT_MS;
      let acquired = await store.setIfAbsent(key, value, REFRESH_LOCK_TTL_MS);

      while (!acquired && Date.now() < deadline) {
        await delay(REFRESH_LOCK_RETRY_MS);
        acquired = await store.setIfAbsent(key, value, REFRESH_LOCK_TTL_MS);
      }

      if (!acquired) throw new SessionRefreshLockTimeoutError();

      try {
        return await callback();
      } finally {
        await store.deleteIfValue(key, value).catch((error: unknown) => {
          console.error('Failed to release storefront session refresh lock', error);
        });
      }
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
