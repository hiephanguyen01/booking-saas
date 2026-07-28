import { RouteErrorState } from '@booking/ui/components/route-error-state';
import type { Route } from './+types/checkout';
import { CheckoutPage } from '~/features/checkout/components/checkout-page';
import {
  handleCheckoutAction,
  loadCheckout,
} from '~/features/checkout/server/checkout-route.server';
import { createTranslator } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';

export function meta({ params }: Route.MetaArgs): Route.MetaDescriptors {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return [
    { title: createTranslator(locale).t('checkout.title') },
    { name: 'robots', content: 'noindex' },
  ];
}

export function loader({ request, url, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadCheckout(request, url, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return handleCheckoutAction(request, locale);
}

export default function CheckoutRoute(props: Route.ComponentProps) {
  return <CheckoutPage {...props} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const homeLabel = createTranslator(locale).t('errors.home');
  return (
    <RouteErrorState error={error} homeHref={storefrontPaths.home(locale)} homeLabel={homeLabel} />
  );
}
