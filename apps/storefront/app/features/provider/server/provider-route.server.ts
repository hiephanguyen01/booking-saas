import { publicPartnerProfileResponseSchema } from '@booking/contracts';
import { publicGetData } from '~/lib/server/api.server';
import { fetchDiscoveryListings } from '~/features/catalog/server/catalog.server';
import { loadPublicReviews } from '~/features/listing/server/public-reviews.server';
import { apiPaths } from '~/constants/api-paths';

export async function loadProviderRoute(request: Request, partnerSlug: string, url: URL) {
  const profile = await publicGetData(
    request,
    apiPaths.public.partner(partnerSlug),
    { schema: publicPartnerProfileResponseSchema, allowNotFound: true },
  );
  if (!profile) throw new Response('Provider not found', { status: 404 });

  const requestedType = url.searchParams.get('type');
  const activeType = profile.listingTypes.some((type) => type.slug === requestedType)
    ? requestedType!
    : profile.listingTypes[0]?.slug;
  const search = new URLSearchParams({
    type: activeType ?? '',
    partner: profile.slug,
    pageSize: '48',
    sort: 'bookings-desc',
  });
  const [listings, reviewData] = await Promise.all([
    activeType ? fetchDiscoveryListings(request, search) : Promise.resolve([]),
    loadPublicReviews(request, url.searchParams, 'partner', profile.slug),
  ]);

  return { profile, listings, activeType, ...reviewData };
}
