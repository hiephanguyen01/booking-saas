import type { Route } from './+types/legacy-partner';
import { redirectLegacyWorkspace } from './workspace-redirect.server';

export function loader({ request, url }: Route.LoaderArgs) {
  return redirectLegacyWorkspace(request, url, undefined);
}
