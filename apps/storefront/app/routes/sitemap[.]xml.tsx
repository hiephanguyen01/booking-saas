import { handleSitemapLoader } from '~/features/seo/server/sitemap-route.server';
import type { Route } from './+types/sitemap[.]xml';

export async function loader({ request, url }: Route.LoaderArgs) {
  return handleSitemapLoader(request, url);
}
