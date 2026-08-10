import type { BookingStatus, PublicListingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { BadgeCheck, CalendarDays, History, Home, Search, WalletCards } from 'lucide-react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import { BookingOutcomeLayout } from './booking-outcome-layout';
import { MobileFlowHeader } from '~/features/site-shell/components/mobile-flow-header';
import { ListingCard } from '~/features/catalog/components/listing-card';
import { formatVnd } from '~/lib/ui';
import { MobileBookingDetail } from './mobile-booking-detail';
import { MobileStickyActionBar } from '~/features/site-shell/components/mobile-sticky-action-bar';
import { cn } from '@booking/ui/lib/utils';
import { PANEL_SURFACE } from '~/constants/surfaces';

interface BookingSuccessViewProps {
  code: string;
  locale: 'en' | 'vi';
  maskedEmail: string | null;
  signedIn: boolean;
  bookingStatus: BookingStatus | null;
  paidAmount: string | null;
  booking: BookingDetailViewModel | null;
  recommendations: PublicListingResponse[];
  showDetail: boolean;
  submitting: boolean;
}

export function BookingSuccessView({
  code,
  locale,
  maskedEmail,
  signedIn,
  bookingStatus,
  paidAmount,
  booking,
  recommendations,
  showDetail,
  submitting,
}: BookingSuccessViewProps) {
  const { t } = useTranslation(NsI18n.Booking);
  const mobilePrimaryHref = signedIn
    ? storefrontPaths.account.booking(locale, code)
    : `${storefrontPaths.booking(locale, code)}?view=detail`;
  const desktopPrimaryHref = signedIn
    ? storefrontPaths.account.bookings(locale)
    : storefrontPaths.bookings(locale);
  const PrimaryIcon = signedIn ? History : Search;

  if (showDetail && booking) {
    return (
      <>
        <MobileBookingDetail
          booking={booking}
          locale={locale}
          backHref={storefrontPaths.booking(locale, code)}
          chatHref={signedIn ? storefrontPaths.account.messages(locale) : undefined}
          actionBar={
            !signedIn && booking.status === 'confirmed' ? (
              <MobileStickyActionBar
                action={
                  <Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <Button
                      type="submit"
                      variant="destructive"
                      size="control"
                      className="w-full text-base font-semibold"
                      disabled={submitting}
                    >
                      {submitting ? <Spinner data-icon="inline-start" /> : null}
                      {t('cancel')}
                    </Button>
                  </Form>
                }
              />
            ) : undefined
          }
        />
        <div className="hidden md:block">
          <DesktopSuccess
            code={code}
            locale={locale}
            maskedEmail={maskedEmail}
            signedIn={signedIn}
            bookingStatus={bookingStatus}
            paidAmount={paidAmount}
            booking={booking}
            primaryHref={desktopPrimaryHref}
            PrimaryIcon={PrimaryIcon}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <MobileSuccess
          code={code}
          locale={locale}
          maskedEmail={maskedEmail}
          booking={booking}
          primaryHref={mobilePrimaryHref}
          recommendations={recommendations}
        />
      </div>
      <div className="hidden md:block">
        <DesktopSuccess
          code={code}
          locale={locale}
          maskedEmail={maskedEmail}
          signedIn={signedIn}
          bookingStatus={bookingStatus}
          paidAmount={paidAmount}
          booking={booking}
          primaryHref={desktopPrimaryHref}
          PrimaryIcon={PrimaryIcon}
        />
      </div>
    </>
  );
}

function DesktopSuccess({
  code,
  locale,
  maskedEmail,
  signedIn,
  bookingStatus,
  paidAmount,
  booking,
  primaryHref,
  PrimaryIcon,
}: Omit<BookingSuccessViewProps, 'recommendations' | 'showDetail' | 'submitting'> & {
  primaryHref: string;
  PrimaryIcon: typeof History;
}) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <BookingOutcomeLayout
      locale={locale}
      title={t('success.title')}
      description={t('success.thanks')}
      code={code}
      bookingStatus={bookingStatus}
      paidAmount={paidAmount}
      booking={booking}
      icon={
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-success/10 text-success ring-1 ring-inset ring-success/20">
          <BadgeCheck className="size-6" strokeWidth={1.8} aria-hidden="true" />
        </span>
      }
      actions={
        // `lg:w-70` and the stacked-then-inline arrangement are checkout's own
        // action treatment, so the button a customer presses here matches the
        // one that brought them.
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button asChild size="control" variant="outline" className="w-full sm:w-auto">
            <Link to={storefrontPaths.home(locale)}>
              <Home data-icon="inline-start" />
              {t('success.home')}
            </Link>
          </Button>
          <Button
            asChild
            size="control"
            className="w-full text-base font-semibold sm:w-auto lg:w-70"
          >
            <Link to={primaryHref}>
              <PrimaryIcon data-icon="inline-start" />
              {signedIn ? t('bookingHistory') : t('success.lookup')}
            </Link>
          </Button>
        </div>
      }
    >
      <p className="mt-4 rounded-lg bg-muted/40 px-5 py-4 text-sm leading-6 text-foreground">
        {maskedEmail ? (
          <>
            {t('success.bookingCodePrefix')} <span className="font-mono font-semibold">{code}</span>{' '}
            {t('success.sentToEmail')} <span className="font-semibold">{maskedEmail}</span>
          </>
        ) : (
          <>
            {t('success.bookingCodeFallbackPrefix')}{' '}
            <span className="font-mono font-semibold">{code}</span>.{' '}
            {t('success.emailSentFallback')}
          </>
        )}
      </p>
    </BookingOutcomeLayout>
  );
}

function MobileSuccess({
  code,
  locale,
  maskedEmail,
  booking,
  primaryHref,
  recommendations,
}: {
  code: string;
  locale: 'en' | 'vi';
  maskedEmail: string | null;
  booking: BookingDetailViewModel | null;
  primaryHref: string;
  recommendations: PublicListingResponse[];
}) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <div className="min-h-dvh bg-muted/45 font-studio">
      <MobileFlowHeader
        title={t('success.mobileTitle')}
        backHref={storefrontPaths.home(locale)}
        backLabel={t('mobile.backHome')}
      />
      <main className="mx-auto w-full max-w-lg pb-8">
        <section className="bg-foreground px-5 pt-5 pb-10 text-center text-background">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-success text-success-foreground shadow-lg">
            <BadgeCheck className="size-9" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{t('success.title')}</h1>
          <p className="mt-2 text-sm text-background/70">{t('success.thanks')}</p>
        </section>

        <section className={cn(PANEL_SURFACE, 'relative -mt-5 mx-3 bg-card p-(--sf-surface-pad)')}>
          <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t('code')}
          </p>
          <p className="mt-1 text-center font-mono text-xl font-bold text-foreground">{code}</p>
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
            {maskedEmail
              ? t('success.mobileEmail', { email: maskedEmail })
              : t('success.emailSentFallback')}
          </p>

          {booking ? (
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 text-sm">
              <SuccessFact
                icon={CalendarDays}
                label={t('success.mobileSchedule')}
                value={`${booking.dateLabel} · ${booking.timeLabel}`}
              />
              <SuccessFact
                icon={WalletCards}
                label={t('success.mobileDeposit')}
                value={formatVnd(booking.paidAmount) ?? '-'}
              />
              <SuccessFact
                icon={WalletCards}
                label={t('success.mobileBalance')}
                value={formatVnd(booking.balanceAmount) ?? '-'}
              />
            </div>
          ) : null}

          <Button asChild size="control" className="mt-5 w-full text-base font-semibold">
            <Link to={primaryHref}>{t('viewDetails')}</Link>
          </Button>
        </section>

        {recommendations.length ? (
          <section className="mt-7" aria-labelledby="booking-recommendations-heading">
            <div className="flex items-end justify-between px-4">
              <div>
                <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                  {t('success.mobileExplore')}
                </p>
                <h2 id="booking-recommendations-heading" className="mt-1 text-lg font-bold">
                  {t('success.recommendations')}
                </h2>
              </div>
            </div>
            <div className="mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-3">
              {recommendations.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  layout="stacked"
                  className="w-52 shrink-0 snap-start"
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function SuccessFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="col-span-2 flex gap-3 rounded-xl bg-muted/60 p-3 first:col-span-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
