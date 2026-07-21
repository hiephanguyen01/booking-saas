import { publicPartnerProfileResponseSchema, reviewListResponseSchema } from '@booking/contracts';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { useOutletContext } from 'react-router';
import type { StorefrontContext } from '../root';
import { ProviderProfilePage } from '../features/provider/provider-profile-page';
import { publicGetData } from '../lib/api.server';
import { fetchListings } from '../lib/catalog.server';
import { jsonLd } from '../lib/seo';
import type { Route } from './+types/provider';

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const profile = loaderData?.profile;
  if (!profile) return [{ title: 'Provider' }];
  return [
    { title: profile.name },
    { name: 'description', content: profile.description ?? `${profile.name} trên Bookify` },
    { property: 'og:title', content: profile.name },
    { property: 'og:type', content: 'profile' },
    ...(profile.logoUrl ? [{ property: 'og:image', content: profile.logoUrl }] : []),
  ];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const profile = await publicGetData(
    request,
    `/public/partners/${encodeURIComponent(params.partnerSlug)}`,
    { schema: publicPartnerProfileResponseSchema, allowNotFound: true },
  );
  if (!profile) throw new Response('Provider not found', { status: 404 });
  const activeType = profile.listingTypes.some((type) => type.slug === url.searchParams.get('type'))
    ? url.searchParams.get('type')!
    : profile.listingTypes[0]?.slug;
  const search = new URLSearchParams({
    type: activeType ?? '',
    partner: profile.slug,
    pageSize: '48',
    sort: 'bookings-desc',
  });
  const [listings, reviews] = await Promise.all([
    activeType ? fetchListings(request, search) : Promise.resolve([]),
    publicGetData(request, '/public/reviews', {
      query: { target: 'partner', slug: profile.slug, page: 1, pageSize: 6, sort: 'newest' },
      schema: reviewListResponseSchema,
    }).catch(() => null),
  ]);
  return { profile, listings, reviews, activeType };
}

export default function ProviderRoute({ loaderData }: Route.ComponentProps) {
  const { canonical } = useOutletContext<StorefrontContext>();
  const { profile } = loaderData;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': profile.partnerType === 'company' ? 'Organization' : 'Person',
    name: profile.name,
    url: canonical,
    description: profile.description,
    image: profile.logoUrl,
    aggregateRating:
      profile.stats.reviewCount && profile.stats.ratingAvg
        ? {
            '@type': 'AggregateRating',
            ratingValue: profile.stats.ratingAvg,
            reviewCount: profile.stats.reviewCount,
          }
        : undefined,
  };
  return (
    <>
      <ProviderProfilePage loaderData={loaderData} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
    </>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return (
    <RouteErrorState
      error={error}
      homeHref={`/${locale}`}
      homeLabel={locale === 'en' ? 'Home' : 'Về trang chủ'}
    />
  );
}
