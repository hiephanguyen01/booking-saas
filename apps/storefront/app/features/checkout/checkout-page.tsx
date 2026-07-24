import type { Route } from '../../routes/+types/checkout';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { BookingColumn } from './components/booking-column';
import { CheckoutForm } from './components/checkout-form';
import { MemberBanner } from './components/member-banner';
import { PaymentHandoff } from './components/payment-handoff';
import { useCheckoutPageController } from './use-checkout-page-controller';

export function CheckoutPage({ loaderData, actionData }: Route.ComponentProps) {
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
    currentUser,
    paymentMethods,
  } = loaderData;
  const { t } = useTranslation(NsI18n.Checkout);
  const {
    amounts,
    searchParams,
    policyLines,
    handoffDestination,
    memberBanner,
    validPromoCode,
    fieldErrors,
    serverError,
  } = useCheckoutPageController({ loaderData, actionData });

  if (handoffDestination) {
    return <PaymentHandoff destination={handoffDestination} />;
  }

  return (
    <div className="bg-muted py-4 sm:py-6 lg:py-8">
      <main className="mx-auto w-full max-w-304.5 px-4 sm:px-6">
        <h1 className="sr-only">{t('title')}</h1>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <BookingColumn
            listing={listing}
            mode={mode}
            start={start}
            end={end}
            qty={qty}
            policyLines={policyLines}
            searchParams={searchParams}
            promoCode={promoCode}
            promo={promo}
            quote={quote}
            amounts={amounts}
          />

          <div className="flex min-w-0 flex-col gap-4">
            {memberBanner ? <MemberBanner {...memberBanner} /> : null}

            <CheckoutForm
              listingId={listing.id}
              listingSlug={listing.slug}
              mode={mode}
              start={start}
              end={end}
              qty={qty}
              packageId={packageId}
              promoCode={validPromoCode}
              currentUser={currentUser}
              fieldErrors={fieldErrors}
              serverError={serverError}
              dueNow={amounts.dueNow}
              expectedSubtotal={quote.subtotal}
              paymentMethods={paymentMethods}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
