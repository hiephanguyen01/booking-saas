import { fetchListingTypes, searchListings } from '~/features/catalog/server/catalog.server';
import { mapWithConcurrency } from '~/lib/server/concurrency.server';
import { getOptionalStorefrontTenant } from '~/lib/server/request-context.server';
import { requestPublicUrl } from '~/lib/seo';

const SITEMAP_PAGE_SIZE = 48;
const SITEMAP_PAGE_CONCURRENCY = 4;

/**
 * Builds the per-domain sitemap: homepage, active listing-type pages and every
 * published listing for the tenant resolved from the requested Host.
 */
export async function handleSitemapLoader(request: Request, routeUrl: URL): Promise<Response> {
  const origin = requestPublicUrl(request, routeUrl).origin;
  if (!getOptionalStorefrontTenant()) {
    return sitemapResponse(
      (['vi', 'en'] as const).map((locale) => platformSitemapEntry(origin, locale)).join('\n'),
    );
  }

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

  return sitemapResponse(urls);
}

function platformSitemapEntry(origin: string, locale: 'vi' | 'en'): string {
  const vi = `${origin}/vi`;
  const en = `${origin}/en`;
  const loc = locale === 'vi' ? vi : en;
  return `  <url><loc>${escapeXml(loc)}</loc><xhtml:link rel="alternate" hreflang="vi" href="${escapeXml(vi)}"/><xhtml:link rel="alternate" hreflang="en" href="${escapeXml(en)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(vi)}"/></url>`;
}

function sitemapResponse(urls: string): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

async function fetchAllListingPaths(request: Request, typeSlug: string): Promise<string[]> {
  const fetchPage = (page: number) =>
    searchListings(
      request,
      new URLSearchParams({
        type: typeSlug,
        page: String(page),
        pageSize: String(SITEMAP_PAGE_SIZE),
      }),
    );

  // Page 1 answers how many pages there are, so the rest need not be serial.
  const first = await fetchPage(1);
  const remaining = Array.from(
    { length: Math.max(0, first.pagination.totalPages - 1) },
    (_, index) => index + 2,
  );
  const rest = await mapWithConcurrency(remaining, SITEMAP_PAGE_CONCURRENCY, fetchPage);

  return [first, ...rest].flatMap((result) =>
    result.items.flatMap((listing) => [
      `/${listing.kind === 'group' ? 'g' : 'l'}/${encodeURIComponent(listing.slug)}`,
      `/p/${encodeURIComponent(listing.partnerSlug)}`,
    ]),
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
