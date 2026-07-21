import { createHash } from 'node:crypto';
import type { Route } from './+types/theme[.]css';
import { getCurrentStorefrontTenant } from '../lib/request-context.server';
import { themeCss } from '../theme/theme';

function themeEtag(css: string): string {
  const digest = createHash('sha256').update(css).digest('base64url');
  return `"${digest}"`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const tenant = getCurrentStorefrontTenant();
  const css = themeCss(tenant.themeConfig);
  const etag = themeEtag(css);
  const headers = new Headers({
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Content-Type': 'text/css; charset=utf-8',
    ETag: etag,
    Vary: 'Host',
  });

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(css, { headers });
}