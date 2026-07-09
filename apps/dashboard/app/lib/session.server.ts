import { createCookieSessionStorage, redirect } from 'react-router';

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
