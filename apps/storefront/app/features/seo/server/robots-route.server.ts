import { requestPublicUrl } from '~/lib/seo';

/**
 * robots.txt (§16.2): allow crawling and point at this domain's sitemap.
 *
 * The origin comes from `requestPublicUrl` — the same guarded host/proto read the
 * sitemap uses — so both files always advertise the same domain.
 */
export function handleRobotsLoader(request: Request, routeUrl: URL): Response {
  const origin = requestPublicUrl(request, routeUrl).origin;
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
