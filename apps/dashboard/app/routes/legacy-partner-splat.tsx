import type { Route } from './+types/legacy-partner-splat';
import { redirectLegacyWorkspace } from './workspace-redirect.server';

export function loader({ request, params, url }: Route.LoaderArgs) {
  return redirectLegacyWorkspace(request, url, params['*']);
}
