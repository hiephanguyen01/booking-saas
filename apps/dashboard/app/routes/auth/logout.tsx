import { redirect } from 'react-router';
import type { Route } from './+types/logout';
import { backendLogout } from '~/lib/api.server';
import { getOptionalUser } from '~/lib/auth.server';
import { destroyUserSession } from '~/lib/session.server';

/** POST-only: revoke the backend session, then destroy the dashboard cookie. */
export async function action({ request }: Route.ActionArgs) {
  const user = await getOptionalUser(request);
  if (user) await backendLogout(user.accessToken);
  return destroyUserSession(request, '/auth/login');
}

export function loader() {
  return redirect('/');
}
