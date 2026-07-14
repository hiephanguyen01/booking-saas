import { randomUUID } from 'node:crypto';
import { createCookie, createCookieSessionStorage, redirect } from 'react-router';
import type { DashboardSessionRecord, DashboardSessionStore } from './session-store.server';

const DASHBOARD_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface DashboardSessionService {
  read(request: Request): Promise<{ id: string; data: DashboardSessionData } | null>;
  create(data: DashboardSessionData): Promise<string>;
  rotate(id: string, data: DashboardSessionData): Promise<void>;
  destroy(request: Request): Promise<string>;
}

interface DashboardSessionServiceOptions {
  store: DashboardSessionStore;
  secrets: string[];
  secure: boolean;
  idFactory?: () => string;
  ttlSeconds?: number;
}

type SessionEnvironment = Record<string, string | undefined>;

export function readSessionSecrets(env: SessionEnvironment): string[] {
  const current = env.SESSION_SECRET_CURRENT ?? env.SESSION_SECRET;
  if (!current) {
    throw new Error('SESSION_SECRET_CURRENT must be configured.');
  }
  if (current.length < 32) {
    throw new Error('SESSION_SECRET_CURRENT must contain at least 32 characters.');
  }

  const secrets = [current];
  const previous = env.SESSION_SECRET_PREVIOUS;
  if (previous) {
    if (previous.length < 32) {
      throw new Error('SESSION_SECRET_PREVIOUS must contain at least 32 characters.');
    }
    secrets.push(previous);
  }
  return secrets;
}

export function createDashboardSessionService({
  store,
  secrets,
  secure,
  idFactory = randomUUID,
  ttlSeconds = DASHBOARD_SESSION_TTL_SECONDS,
}: DashboardSessionServiceOptions): DashboardSessionService {
  const cookie = createCookie('__dashboard_session', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure,
    secrets,
    maxAge: ttlSeconds,
  });

  return {
    async read(request) {
      const id: unknown = await cookie.parse(request.headers.get('Cookie'));
      if (typeof id !== 'string' || !id) return null;

      const stored = await store.get(id);
      const data = toDashboardSessionData(stored);
      if (!data) {
        await store.delete(id);
        return null;
      }
      return { id, data };
    },

    async create(data) {
      const id = idFactory();
      await store.set(id, data, ttlSeconds);
      return cookie.serialize(id);
    },

    async rotate(id, data) {
      await store.set(id, data, ttlSeconds);
    },

    async destroy(request) {
      const id: unknown = await cookie.parse(request.headers.get('Cookie'));
      if (typeof id === 'string' && id) await store.delete(id);
      return cookie.serialize('', { expires: new Date(0), maxAge: 0 });
    },
  };
}

function toDashboardSessionData(record: DashboardSessionRecord | null): DashboardSessionData | null {
  return record ? { ...record } : null;
}

/**
 * Dashboard BFF session cookie. The backend issues opaque `sid`/`rid` tokens as
 * httpOnly cookies on login; the dashboard captures their VALUES and stores them
 * here, then replays them to the API server-side (Cookie: sid=… / rid=…). The
 * browser never sees a token — this cookie is httpOnly too.
 */
const secure = process.env.SESSION_COOKIE_SECURE
  ? process.env.SESSION_COOKIE_SECURE !== 'false'
  : process.env.NODE_ENV === 'production';

export interface DashboardSessionData {
  /** Backend access-session token (was the `sid` cookie value). */
  accessToken: string;
  /** Backend refresh token (was the `rid` cookie value). */
  refreshToken: string;
  userId: string;
}

export const sessionStorage = createCookieSessionStorage<DashboardSessionData>({
  cookie: {
    name: '__session',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure,
    secrets: [process.env.SESSION_SECRET ?? 'dev-dashboard-session-secret-change-me'],
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;

/** Stores the backend tokens in a fresh cookie and redirects to `redirectTo`. */
export async function createUserSession(
  request: Request,
  data: DashboardSessionData,
  redirectTo: string,
): Promise<Response> {
  const session = await getSession(request.headers.get('Cookie'));
  session.set('accessToken', data.accessToken);
  session.set('refreshToken', data.refreshToken);
  session.set('userId', data.userId);
  return redirect(redirectTo, { headers: { 'Set-Cookie': await commitSession(session) } });
}

/** Destroys the dashboard cookie and redirects (used by logout). */
export async function destroyUserSession(request: Request, redirectTo: string): Promise<Response> {
  const session = await getSession(request.headers.get('Cookie'));
  return redirect(redirectTo, { headers: { 'Set-Cookie': await destroySession(session) } });
}
