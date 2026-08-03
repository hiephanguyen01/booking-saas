import { redirect } from 'react-router';
import type { Route } from './+types/logout';
import { backendLogout } from '~/lib/api.server';
import { getOptionalUser } from '~/lib/auth.server';
import { suppressAuthSessionCommit } from '~/lib/request-auth.server';
import { destroyUserSession } from '~/lib/session.server';
import { dashboardPaths } from '~/constants/paths';

/** POST-only: revoke the backend session, then destroy the dashboard cookie. */
export async function action({ request }: Route.ActionArgs) {
  suppressAuthSessionCommit();
  const user = await getOptionalUser(request);
  if (user) await backendLogout(user.accessToken);
  return destroyUserSession(request, dashboardPaths.auth.login);
}

export function loader() {
  return redirect('/');
}
