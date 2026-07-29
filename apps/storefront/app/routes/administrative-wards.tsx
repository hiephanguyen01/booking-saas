import { handleAdministrativeWardsLoader } from '~/lib/server/administrative-divisions.server';
import type { Route } from './+types/administrative-wards';

export function loader({ request }: Route.LoaderArgs) {
  return handleAdministrativeWardsLoader(request);
}
