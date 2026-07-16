import { useLocation, useOutletContext, useSearchParams } from 'react-router';
import type { Route } from '../../routes/+types/checkout';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import { useLocale } from '../../lib/use-locale';
import type { StorefrontContext } from '../../root';
import { checkoutAmounts, policyLines } from './checkout-presentation';
import { BookingColumn } from './components/booking-column';
import { CheckoutForm } from './components/checkout-form';
import { MemberBanner } from './components/member-banner';

export function CheckoutPage({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, mode, start, end, qty, quote, promoCode, promo, currentUser } = loaderData;
  const { t } = useTranslation(NsI18n.Checkout);
  const { tenant } = useOutletContext<StorefrontContext>();
  const locale = useLocale();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const amounts = checkoutAmounts(quote, promo?.valid ? promo : null);
  const checkoutPath = `${location.pathname}${location.search}`;

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
            policies={policyLines(listing.cancellationPolicy)}
            searchParams={searchParams}
            promoCode={promoCode}
            promo={promo}
            quote={quote}
            amounts={amounts}
          />

          <div className="flex min-w-0 flex-col gap-4">
            {!currentUser ? (
              <MemberBanner
                tenantName={tenant.name}
                loginHref={storefrontPaths.login(locale, checkoutPath)}
                registerHref={`${storefrontPaths.register(locale)}?redirectTo=${encodeURIComponent(checkoutPath)}`}
              />
            ) : null}

            <CheckoutForm
              listingId={listing.id}
              listingSlug={listing.slug}
              mode={mode}
              start={start}
              end={end}
              qty={qty}
              promoCode={promo?.valid ? promoCode : null}
              currentUser={currentUser}
              fieldErrors={actionData?.fieldErrors ?? null}
              serverError={actionData?.error ?? null}
              dueNow={amounts.dueNow}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
