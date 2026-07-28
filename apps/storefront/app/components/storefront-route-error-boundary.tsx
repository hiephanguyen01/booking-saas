import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { storefrontPaths } from '~/constants/paths';
import { createTranslator } from '~/lib/i18n';

interface StorefrontRouteErrorBoundaryProps {
  error: unknown;
  locale?: string;
  destination?: 'home' | 'bookings';
}

export function StorefrontRouteErrorBoundary({
  error,
  locale: localeParam,
  destination = 'home',
}: StorefrontRouteErrorBoundaryProps) {
  const locale = localeParam === 'en' ? 'en' : 'vi';
  const { t } = createTranslator(locale);
  const homeHref =
    destination === 'bookings' ? storefrontPaths.bookings(locale) : storefrontPaths.home(locale);
  const homeLabel = destination === 'bookings' ? t('navigation.lookup') : t('errors.home');

  return <RouteErrorState error={error} homeHref={homeHref} homeLabel={homeLabel} />;
}
