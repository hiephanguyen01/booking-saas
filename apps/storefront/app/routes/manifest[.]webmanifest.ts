import { buildManifestResponse } from '~/features/pwa/server/manifest-route.server';
import type { Route } from './+types/manifest[.]webmanifest';

export function loader({ request }: Route.LoaderArgs) {
  return buildManifestResponse(request);
}
