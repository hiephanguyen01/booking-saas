import type { Route } from './+types/robots[.]txt';

/** robots.txt (§16.2): allow crawling + point at this domain's sitemap. */
export function loader({ request, url }: Route.LoaderArgs) {
  const host = request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const origin = `${proto}://${host}`;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /*/checkout',
    'Disallow: /*/bookings',
    'Disallow: /set-locale',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
