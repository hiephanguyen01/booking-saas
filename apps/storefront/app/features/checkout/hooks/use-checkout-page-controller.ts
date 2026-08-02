import { checkoutDestinationSchema } from '@booking/contracts';
import { useLocation, useOutletContext, useSearchParams } from 'react-router';
import type {
  handleCheckoutAction,
  loadCheckout,
} from '~/features/checkout/server/checkout-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import type { StorefrontContext } from '~/root';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';
import {
  checkoutAmounts,
  checkoutCancellationLines,
} from '~/features/checkout/lib/checkout-presentation';

export interface CheckoutPageControllerProps {
  loaderData: ServerDataFrom<typeof loadCheckout>;
  actionData?: ServerDataFrom<typeof handleCheckoutAction>;
}

export function useCheckoutPageController({ loaderData, actionData }: CheckoutPageControllerProps) {
  const { listing, start, quote, promoCode, promo, currentUser } = loaderData;
  const { tenant } = useOutletContext<StorefrontContext>();
  const locale = useLocale();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const amounts = checkoutAmounts(quote, promo?.valid ? promo : null);
  const checkoutPath = `${location.pathname}${location.search}`;
  const handoff = checkoutDestinationSchema.safeParse(
    actionData && 'handoff' in actionData ? actionData.handoff : null,
  );
  const handoffDestination =
    handoff.success && handoff.data.type === 'form_post' ? handoff.data : null;
  const memberBanner = currentUser
    ? null
    : {
        tenantName: tenant.name,
        loginHref: storefrontPaths.login(locale, checkoutPath),
        registerHref: `${storefrontPaths.register(locale)}?redirectTo=${encodeURIComponent(checkoutPath)}`,
      };

  return {
    amounts,
    searchParams,
    policyLines: checkoutCancellationLines(
      listing.effectiveCancellationPolicy ?? listing.cancellationPolicy,
      start,
      amounts.deposit,
    ),
    handoffDestination,
    memberBanner,
    validPromoCode: promo?.valid ? promoCode : null,
    fieldErrors: actionData?.fieldErrors ?? null,
    serverError: actionData?.error ?? null,
    checkoutAttemptId: actionData?.checkoutAttemptId ?? loaderData.checkoutAttemptId,
  };
}
