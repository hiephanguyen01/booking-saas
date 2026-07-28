import { handleFavoritesToggleAction } from '~/features/favorites/server/favorites-toggle-route.server';
import type { Route } from './+types/favorites-toggle';

export async function action({ request }: Route.ActionArgs) {
  return handleFavoritesToggleAction(request);
}
