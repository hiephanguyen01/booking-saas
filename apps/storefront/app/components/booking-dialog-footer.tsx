import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { PendingLink } from './pending-link';
import { NsI18n, useTranslation } from '../lib/i18n';
import { formatVnd } from '../lib/ui';

export function BookingDialogFooter({
  selectionSummary,
  quote,
  quotePending,
  bookingHref,
  disabledLabel,
}: {
  selectionSummary: string | null;
  quote: string | null;
  quotePending: boolean;
  bookingHref: string | null;
  disabledLabel: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);

  return (
    <div className="shrink-0 border-t bg-card px-5 py-4 shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.35)]">
      <div className="min-h-11" aria-live="polite" aria-atomic="true">
        {selectionSummary ? (
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('group.selectedSchedule')}</p>
              <p className="mt-0.5 truncate text-sm font-medium">{selectionSummary}</p>
            </div>
            {quote !== null ? (
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">{t('subtotalEstimate')}</p>
                <strong className="text-lg text-primary">{formatVnd(quote)}</strong>
              </div>
            ) : quotePending ? (
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden="true" /> {t('group.calculatingPrice')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {bookingHref ? (
        <PendingLink
          to={bookingHref}
          size="control"
          className="mt-3 w-full"
          pendingLabel={t('group.navigating')}
        >
          {t('bookNow')}
        </PendingLink>
      ) : (
        <Button disabled size="control" className="mt-3 w-full">
          {quotePending ? <Spinner aria-hidden="true" /> : null}
          {disabledLabel}
        </Button>
      )}
    </div>
  );
}
