import type { Route } from './+types/checkout';
import { StorefrontRouteErrorBoundary } from '~/components/storefront-route-error-boundary';
import { localeParam } from '~/constants/paths';
import { CheckoutPage } from '~/features/checkout/components/checkout-page';
import {
  handleCheckoutAction,
  loadCheckout,
} from '~/features/checkout/server/checkout-route.server';
import { createTranslator } from '~/lib/i18n';

export function meta({ params }: Route.MetaArgs): Route.MetaDescriptors {
  const locale = localeParam(params.locale);
  return [
    { title: createTranslator(locale).t('checkout.title') },
    { name: 'robots', content: 'noindex' },
  ];
}

export function loader({ request, url, params }: Route.LoaderArgs) {
  const locale = localeParam(params.locale);
  return loadCheckout(request, url, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = localeParam(params.locale);
  return handleCheckoutAction(request, locale);
}

export default function CheckoutRoute(props: Route.ComponentProps) {
  return <CheckoutPage {...props} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  return <StorefrontRouteErrorBoundary error={error} locale={params.locale} />;
}
