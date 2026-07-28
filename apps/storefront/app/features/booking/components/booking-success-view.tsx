import { Button } from '@booking/ui/components/ui/button';
import { BadgeCheck, History, Home, Search } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';

interface BookingSuccessViewProps {
  code: string;
  locale: 'en' | 'vi';
  maskedEmail: string | null;
  signedIn: boolean;
}

export function BookingSuccessView({
  code,
  locale,
  maskedEmail,
  signedIn,
}: BookingSuccessViewProps) {
  const { t } = useTranslation(NsI18n.Booking);
  const primaryHref = signedIn
    ? storefrontPaths.account.bookings(locale)
    : storefrontPaths.bookings(locale);
  const PrimaryIcon = signedIn ? History : Search;

  return (
    <div className="bg-muted/20 px-4 py-10 font-studio sm:px-6 sm:py-14 lg:py-16">
      <section
        aria-labelledby="booking-success-title"
        className="mx-auto flex w-full max-w-107.5 flex-col items-center justify-center gap-5 bg-card p-6 text-center shadow-[0_4px_15px_rgba(0,0,0,0.07)] sm:p-10"
      >
        <BadgeCheck
          className="size-15 shrink-0 text-[#0abf90]"
          strokeWidth={1.8}
          aria-hidden="true"
        />

        <div className="flex flex-col items-center gap-2">
          <h1
            id="booking-success-title"
            className="text-base leading-6 font-semibold text-foreground"
          >
            {t('success.title')}
          </h1>
          <div className="w-full max-w-80 text-sm leading-5 text-foreground">
            <p>{t('success.thanks')}</p>
            <p>
              {maskedEmail ? (
                <>
                  {t('success.bookingCodePrefix')}{' '}
                  <span className="font-medium text-[#009b76]">{code}</span>{' '}
                  {t('success.sentToEmail')}{' '}
                  <span className="font-medium text-foreground">{maskedEmail}</span>
                </>
              ) : (
                <>
                  {t('success.bookingCodeFallbackPrefix')}{' '}
                  <span className="font-medium text-[#009b76]">{code}</span>.{' '}
                  {t('success.emailSentFallback')}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex w-full max-w-87.5 flex-col gap-4">
          <Button asChild className="h-12 w-full rounded-sm px-5 text-base font-semibold">
            <Link to={primaryHref}>
              <PrimaryIcon className="size-6" data-icon="inline-start" />
              {signedIn ? t('bookingHistory') : t('success.lookup')}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-12 w-full rounded-sm border-primary px-5 text-base font-semibold text-primary hover:bg-primary/5 hover:text-primary"
          >
            <Link to={storefrontPaths.home(locale)}>
              <Home className="size-6" data-icon="inline-start" />
              {t('success.home')}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
