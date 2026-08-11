import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { QuoteSkeleton } from './loading-skeletons';
import { PendingLink } from './pending-link';
import { NsI18n, useTranslation } from '@booking/i18n';
import { formatVnd } from '~/lib/ui';

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
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const showQuote = quote !== null && !quotePending;

  return (
    // `--sf-lip-shadow`, not the card shadow: this casts *upward* to lift a
    // sticky footer off the content scrolling under it, so it cannot share the
    // token that gives cards their downward elevation.
    <div className="shrink-0 border-t bg-card px-5 py-4 shadow-(--sf-lip-shadow)">
      <div aria-live="polite" aria-atomic="true" aria-busy={quotePending}>
        {selectionSummary ? (
          <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(8rem,auto)] items-stretch gap-4">
            <div className="flex min-w-0 flex-col justify-center">
              <p className="text-xs text-muted-foreground">{t('group.selectedSchedule')}</p>
              <p className="mt-0.5 text-sm leading-5 font-medium">{selectionSummary}</p>
            </div>

            <div className="flex min-w-32 flex-col justify-center text-right">
              <p className="h-4 text-xs text-muted-foreground">{t('subtotalEstimate')}</p>
              <div className="flex h-7 items-center justify-end">
                {showQuote ? (
                  <strong className="text-lg text-primary">{formatVnd(quote)}</strong>
                ) : quotePending ? (
                  <QuoteSkeleton label={t('common:loading')} />
                ) : (
                  <span className="invisible text-lg select-none" aria-hidden="true">
                    0&nbsp;₫
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className={selectionSummary ? 'relative mt-3 h-11' : 'relative h-11'}>
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
