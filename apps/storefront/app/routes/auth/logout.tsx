import type { Route } from './+types/logout';
import { logoutAction } from '~/features/auth/server/auth-routes.server';
export const action = ({ request, params }: Route.ActionArgs) =>
  logoutAction(request, params.locale);
export function loader() {
  throw new Response('Method not allowed', { status: 405 });
}
export default function LogoutRoute() {
  return null;
}
