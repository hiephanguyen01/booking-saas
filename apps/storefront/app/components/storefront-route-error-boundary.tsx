import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { localeTranslator } from '~/lib/translator';
import { localeParam, storefrontPaths } from '~/constants/paths';

interface StorefrontRouteErrorBoundaryProps {
  error: unknown;
  locale?: string;
  destination?: 'home' | 'bookings';
}

export function StorefrontRouteErrorBoundary({
  error,
  locale: localeValue,
  destination = 'home',
}: StorefrontRouteErrorBoundaryProps) {
  const locale = localeParam(localeValue);
  const { t } = localeTranslator(locale);
  const homeHref =
    destination === 'bookings' ? storefrontPaths.bookings(locale) : storefrontPaths.home(locale);
  const homeLabel = destination === 'bookings' ? t('navigation.lookup') : t('errors.home');

  return <RouteErrorState error={error} homeHref={homeHref} homeLabel={homeLabel} />;
}
