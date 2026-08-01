import type { QuoteResponse, ValidatePromoResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { NsI18n, useTranslation } from '@booking/i18n';
import { formatVnd } from '~/lib/ui';
import { campaignLabelsOf } from '~/lib/quote';
import type { checkoutAmounts } from '~/features/checkout/lib/checkout-presentation';

export function PricePanel({
  quote,
  promo,
  amounts,
  qty,
  mode,
  slotCount,
  dayCount,
}: {
  quote: QuoteResponse;
  promo: ValidatePromoResponse | null;
  amounts: ReturnType<typeof checkoutAmounts>;
  qty: string;
  mode: string;
  slotCount: number;
  dayCount: number;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const { t: tListing } = useTranslation(NsI18n.Listing);
  const hasDiscount = amounts.discount !== '0';
  const quantity = mode === 'inventory' ? qty : '1';
  const quantityLabel =
    mode === 'daily'
      ? t('dailyQuantityLine', { rooms: quantity, days: dayCount })
      : mode === 'inventory'
        ? t('inventoryQuantityLine', { quantity })
        : t('quantityLine', { rooms: quantity, slots: slotCount });
  const hasCalendarSale = quote.regularSubtotal !== quote.subtotal;
  const hasPromotion = hasDiscount || hasCalendarSale;
  // Partner-authored, already in the tenant's language — shown verbatim, never
  // translated. Several campaigns can price one booking, so join rather than
  // pick one.
  const campaigns = campaignLabelsOf(quote);

  return (
    <div
      className={cn(
        'mt-3 rounded-lg px-5 py-4 text-sm leading-5 text-foreground',
        hasPromotion ? 'bg-success/10' : 'bg-muted/40',
      )}
    >
      {hasCalendarSale ? (
        <div className="mb-2 flex items-center justify-between gap-4">
          <Badge variant="success" className="rounded-sm">
            {campaigns.length > 0 ? campaigns.join(' · ') : t('saleBadge')}
          </Badge>
          <span className="text-muted-foreground line-through">
            {formatVnd(quote.regularSubtotal)}
          </span>
        </div>
      ) : null}
      {hasDiscount ? (
        <div className="flex items-center justify-between gap-4">
          <Badge variant="success" className="rounded-sm font-semibold">
            {promo?.code ?? t('discount')}
          </Badge>
          <span className="text-muted-foreground line-through">{formatVnd(amounts.subtotal)}</span>
        </div>
      ) : null}
      <PriceRow
        label={quantityLabel}
        value={formatVnd(amounts.subtotal)}
        className={hasDiscount ? 'mt-2' : ''}
      />
      <PriceRow
        label={t('discount')}
        value={`− ${formatVnd(amounts.discount)}`}
        className={cn('mt-2', hasDiscount && 'text-success')}
      />
      {quote.securityDeposit !== '0' ? (
        <PriceRow
          label={tListing('securityDeposit')}
          value={formatVnd(quote.securityDeposit)}
          className="mt-2"
        />
      ) : null}
      <PriceRow
        label={t('total')}
        value={formatVnd(amounts.finalAmount)}
        className="mt-2 text-base leading-6 font-semibold"
      />
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{t('totalIncludes')}</p>
    </div>
  );
}

function PriceRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', className)}>
      <span>{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
