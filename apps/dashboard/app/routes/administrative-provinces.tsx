import { requireUser } from '~/lib/auth.server';
import { loadAdministrativeProvinces } from '~/lib/administrative-divisions.server';
import type { Route } from './+types/administrative-provinces';

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const provinces = await loadAdministrativeProvinces({ token: user.accessToken }, request.signal);
  return Response.json({ provinces }, { headers: { 'Cache-Control': 'private, max-age=86400' } });
}
