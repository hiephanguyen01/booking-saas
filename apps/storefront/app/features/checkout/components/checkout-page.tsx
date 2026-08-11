import type { CheckoutPageControllerProps } from '~/features/checkout/hooks/use-checkout-page-controller';
import { NsI18n, useTranslation } from '@booking/i18n';
import { BookingColumn } from './booking-column';
import { CheckoutForm } from './checkout-form';
import { MemberBanner } from './member-banner';
import { PaymentHandoff } from './payment-handoff';
import { useCheckoutPageController } from '~/features/checkout/hooks/use-checkout-page-controller';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';
import { MobileFlowHeader } from '~/features/site-shell/components/mobile-flow-header';

export function CheckoutPage({ loaderData, actionData }: CheckoutPageControllerProps) {
  const {
    listing,
    mode,
    start,
    end,
    qty,
    packageId,
    quote,
    promoCode,
    promo,
    availablePromotions,
    promotionsUnavailable,
    currentUser,
    paymentMethods,
    legalConsent,
  } = loaderData;
  const { t } = useTranslation(NsI18n.Checkout);
  const locale = useLocale();
  const {
    amounts,
    searchParams,
    policyLines,
    handoffDestination,
    memberBanner,
    validPromoCode,
    fieldErrors,
    serverError,
    checkoutAttemptId,
  } = useCheckoutPageController({ loaderData, actionData });

  if (handoffDestination) {
    return <PaymentHandoff destination={handoffDestination} />;
  }

  const sharedBookingProps = {
    listing,
    mode,
    start,
    end,
    qty,
    policyLines,
    searchParams,
    promoCode,
    promo,
    availablePromotions,
    promotionsUnavailable,
    quote,
    amounts,
  };
  const sharedFormProps = {
    listingId: listing.id,
    listingSlug: listing.slug,
    mode,
    start,
    end,
    qty,
    packageId,
    promoCode: validPromoCode,
    currentUser,
    fieldErrors,
    serverError,
    dueNow: amounts.dueNow,
    expectedSubtotal: quote.subtotal,
    paymentMethods,
    checkoutAttemptId,
    legalConsent,
  };

  return (
    <div className="bg-muted md:py-6 lg:py-8">
      <div className="md:hidden">
        <MobileFlowHeader
          title={t('title')}
          backHref={storefrontPaths.listing(locale, listing.slug)}
          backLabel={t('mobile.back')}
        />
        <div className="mx-auto w-full max-w-lg space-y-(--sf-section-gap) px-3 py-(--sf-section-gap) pb-32">
          <h1 className="sr-only">{t('title')}</h1>
          <BookingColumn {...sharedBookingProps} />
          {memberBanner ? <MemberBanner {...memberBanner} /> : null}
          <CheckoutForm {...sharedFormProps} mobile />
        </div>
      </div>

      <div className="mx-auto hidden w-full max-w-304.5 px-4 sm:px-6 md:block">
        <h1 className="sr-only">{t('title')}</h1>
        {/* `[&>*]:min-w-0`: a grid item defaults to `min-width:auto`, so the
            booking summary's min-content width (thumbnail + text) widened the
            single-column track and scrolled the page sideways below ~360px. */}
        <div className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <BookingColumn {...sharedBookingProps} />

          <div className="flex min-w-0 flex-col gap-4">
            {memberBanner ? <MemberBanner {...memberBanner} /> : null}

            <CheckoutForm {...sharedFormProps} />
          </div>
        </div>
      </div>
    </div>
  );
}
