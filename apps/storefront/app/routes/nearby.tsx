import { handleNearbyAction } from '~/features/home/server/nearby-route.server';
import type { Route } from './+types/nearby';

export async function action({ request }: Route.ActionArgs) {
  return handleNearbyAction(request);
}
