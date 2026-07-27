import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { ProviderRoutePage } from '../features/provider/provider-route-page';
import { loadProviderRoute } from '../features/provider/server/provider-route.server';
import type { Route } from './+types/provider';

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const profile = loaderData?.profile;
  if (!profile) return [{ title: 'Provider' }];
  return [
    { title: profile.name },
    { name: 'description', content: profile.description ?? `${profile.name} trên BookingOS` },
    { property: 'og:title', content: profile.name },
    { property: 'og:type', content: 'profile' },
    ...(profile.logoUrl ? [{ property: 'og:image', content: profile.logoUrl }] : []),
  ];
}

export function loader({ request, params, url }: Route.LoaderArgs) {
  return loadProviderRoute(request, params.partnerSlug, url);
}

export default function ProviderRoute(props: Route.ComponentProps) {
  return <ProviderRoutePage {...props} />;
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
