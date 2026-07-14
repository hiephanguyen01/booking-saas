import type { Route } from './+types/sitemap[.]xml';
import { fetchListings, fetchListingTypes } from '../lib/catalog.server';

/**
 * Per-domain sitemap (§16.2): homepage + active listing-type pages + published
 * listings for the tenant resolved from this Host. Absolute URLs use the public
 * host the crawler requested.
 */
export async function loader({ request, url }: Route.LoaderArgs) {
  const host = request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const origin = `${proto}://${host}`;

  const [types, listings] = await Promise.all([
    fetchListingTypes(request),
    fetchListings(request, new URLSearchParams()),
  ]);

  const paths = [
    '/',
    ...types.map((type) => `/t/${encodeURIComponent(type.slug)}`),
    ...listings.map((listing) => `/l/${encodeURIComponent(listing.slug)}`),
  ];

  const urls = paths
    .map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`)
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
