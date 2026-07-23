import { publicPartnerProfileResponseSchema } from '@booking/contracts';
import { publicGetData } from '../../../lib/api.server';
import { fetchListings } from '../../../lib/catalog.server';
import { loadPublicReviews } from '../../../lib/public-reviews.server';

export async function loadProviderRoute(request: Request, partnerSlug: string, url: URL) {
  const profile = await publicGetData(
    request,
    `/public/partners/${encodeURIComponent(partnerSlug)}`,
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
    activeType ? fetchListings(request, search) : Promise.resolve([]),
    loadPublicReviews(request, url.searchParams, 'partner', profile.slug),
  ]);

  return { profile, listings, activeType, ...reviewData };
}
