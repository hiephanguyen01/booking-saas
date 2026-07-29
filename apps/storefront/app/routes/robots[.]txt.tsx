import { handleRobotsLoader } from '~/features/seo/server/robots-route.server';
import type { Route } from './+types/robots[.]txt';

export function loader({ request, url }: Route.LoaderArgs) {
  return handleRobotsLoader(request, url);
}
