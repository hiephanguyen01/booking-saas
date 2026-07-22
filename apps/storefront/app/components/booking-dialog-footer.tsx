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
  const showQuote = quote !== null && !quotePending;

  return (
    <div className="shrink-0 border-t bg-card px-5 py-4 shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.35)]">
      <div
        className="grid h-11 grid-cols-[minmax(0,1fr)_minmax(8rem,auto)] items-stretch gap-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="flex min-w-0 flex-col justify-center">
          <p
            className={
              selectionSummary ? 'text-xs text-muted-foreground' : 'invisible text-xs select-none'
            }
          >
            {t('group.selectedSchedule')}
          </p>
          <p
            className={
              selectionSummary
                ? 'mt-0.5 truncate text-sm font-medium'
                : 'invisible mt-0.5 truncate text-sm select-none'
            }
          >
            {selectionSummary ?? t('group.selectedSchedule')}
          </p>
        </div>

        <div className="flex min-w-32 flex-col justify-center text-right">
          <p
            className={
              selectionSummary ? 'h-4 text-xs text-muted-foreground' : 'invisible h-4 text-xs'
            }
          >
            {t('subtotalEstimate')}
          </p>
          <div className="flex h-7 items-center justify-end">
            {showQuote ? (
              <strong className="text-lg text-primary">{formatVnd(quote)}</strong>
            ) : quotePending && selectionSummary ? (
              <span className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                <Spinner aria-hidden="true" /> {t('group.calculatingPrice')}
              </span>
            ) : (
              <span className="invisible text-lg select-none" aria-hidden="true">
                0&nbsp;₫
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="relative mt-3 h-11">
        {bookingHref ? (
          <PendingLink
            to={bookingHref}
            size="control"
            className="absolute inset-0 h-11 w-full"
            pendingLabel={t('group.navigating')}
          >
            {t('bookNow')}
          </PendingLink>
        ) : (
          <Button disabled size="control" className="absolute inset-0 h-11 w-full">
            {quotePending ? <Spinner aria-hidden="true" /> : null}
            {disabledLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
