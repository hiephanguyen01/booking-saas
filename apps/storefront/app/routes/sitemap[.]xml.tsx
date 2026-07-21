import type { Route } from './+types/sitemap[.]xml';
import { fetchListingTypes, searchListings } from '../lib/catalog.server';
import { requestPublicUrl } from '../lib/seo';

const SITEMAP_PAGE_SIZE = 48;

/**
 * Per-domain sitemap (§16.2): homepage + active listing-type pages + every
 * published listing for the tenant resolved from this Host. Absolute URLs use
 * the public host the crawler requested.
 */
export async function loader({ request, url }: Route.LoaderArgs) {
  const origin = requestPublicUrl(request, url).origin;
  const types = await fetchListingTypes(request);
  const listingPathBatches = await Promise.all(
    types.map((type) => fetchAllListingPaths(request, type.slug)),
  );

  const paths = new Set<string>([
    '',
    ...types.map((type) => `/t/${encodeURIComponent(type.slug)}`),
    ...listingPathBatches.flat(),
  ]);
  const entries = [...paths].flatMap((path) =>
    (['vi', 'en'] as const).map((locale) => ({ locale, path })),
  );

  const urls = entries
    .map(({ locale, path }) => {
      const vi = `${origin}/vi${path}`;
      const en = `${origin}/en${path}`;
      const loc = locale === 'vi' ? vi : en;
      return `  <url><loc>${escapeXml(loc)}</loc><xhtml:link rel="alternate" hreflang="vi" href="${escapeXml(vi)}"/><xhtml:link rel="alternate" hreflang="en" href="${escapeXml(en)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(vi)}"/></url>`;
    })
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

async function fetchAllListingPaths(request: Request, typeSlug: string): Promise<string[]> {
  const paths: string[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await searchListings(
      request,
      new URLSearchParams({
        type: typeSlug,
        page: String(page),
        pageSize: String(SITEMAP_PAGE_SIZE),
      }),
    );
    paths.push(
      ...result.items.map(
        (listing) =>
          `/${listing.kind === 'group' ? 'g' : 'l'}/${encodeURIComponent(listing.slug)}`,
      ),
    );
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return paths;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
