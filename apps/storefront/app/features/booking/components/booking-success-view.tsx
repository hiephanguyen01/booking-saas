import type { BookingStatus } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { BadgeCheck, History, Home, Search } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { BookingOutcomeLayout } from './booking-outcome-layout';

interface BookingSuccessViewProps {
  code: string;
  locale: 'en' | 'vi';
  maskedEmail: string | null;
  signedIn: boolean;
  bookingStatus: BookingStatus | null;
  paidAmount: string | null;
}

export function BookingSuccessView({
  code,
  locale,
  maskedEmail,
  signedIn,
  bookingStatus,
  paidAmount,
}: BookingSuccessViewProps) {
  const { t } = useTranslation(NsI18n.Booking);
  const primaryHref = signedIn
    ? storefrontPaths.account.bookings(locale)
    : storefrontPaths.bookings(locale);
  const PrimaryIcon = signedIn ? History : Search;

  return (
    <BookingOutcomeLayout
      locale={locale}
      title={t('success.title')}
      description={t('success.thanks')}
      code={code}
      bookingStatus={bookingStatus}
      paidAmount={paidAmount}
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
            {t('success.bookingCodePrefix')}{' '}
            <span className="font-mono font-semibold">{code}</span> {t('success.sentToEmail')}{' '}
            <span className="font-semibold">{maskedEmail}</span>
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
