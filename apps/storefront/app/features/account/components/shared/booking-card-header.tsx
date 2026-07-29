import type { BookingStatus } from '@booking/contracts';
import { formatDateTime, type Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { Building2, MessageSquareText } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { BookingStatusBadge } from './booking-status-badge';

export function BookingCardHeader({
  partnerName,
  listingSlug,
  bookingCode,
  status,
  locale,
  createdAt,
}: {
  partnerName: string;
  listingSlug: string;
  bookingCode: string;
  status: BookingStatus;
  locale: Locale;
  createdAt?: string;
}) {
  const { t } = useTranslation(NsI18n.Account);

  return (
    <header className="mx-5 flex min-h-18 flex-col justify-center gap-3 border-b border-border py-4 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
        <Link
          to={storefrontPaths.listing(locale, listingSlug)}
          className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-foreground hover:underline"
        >
          <Building2 aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{partnerName}</span>
        </Link>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-9 rounded-sm border-primary px-4 text-primary hover:bg-primary/5 hover:text-primary"
        >
          <Link to={storefrontPaths.account.messages(locale)}>
            <MessageSquareText aria-hidden="true" className="size-4" />
            {t('bookings.chat')}
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground sm:justify-end">
        <span className="font-medium uppercase">
          {t('bookings.bookingCode', { code: bookingCode })}
        </span>
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <BookingStatusBadge status={status} />
        {createdAt ? (
          <span className="sr-only">
            {t('bookings.placedAt', {
              date: formatDateTime(createdAt, locale, 'Asia/Ho_Chi_Minh'),
            })}
          </span>
        ) : null}
      </div>
    </header>
  );
}
